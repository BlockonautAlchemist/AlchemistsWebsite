const assert = require('node:assert/strict');
const test = require('node:test');

const chatHandler = require('../api/vision-forge/chat');
const { isPreviewIntentMessage } = require('../vision-forge');
const {
  DISCORD_CLOSING_LINES,
  formatDiscordMessage,
  MAX_DISCORD_MESSAGE_LENGTH
} = require('../server/vision-forge/discord');
const { buildCollaboratorMessages } = require('../server/vision-forge/prompts');
const {
  completePreview,
  evaluatePreview,
  generatePreview,
  parsePreviewContent
} = require('../server/vision-forge/preview');
const {
  hasRequiredPreviewFields,
  LIMITS,
  normalizePreview,
  sanitizeText,
  validateChatPayload
} = require('../server/vision-forge/validation');

const originalFetch = global.fetch;
const originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY;
const originalOpenRouterModel = process.env.OPENROUTER_MODEL;

test.after(() => {
  global.fetch = originalFetch;

  if (originalOpenRouterApiKey === undefined) {
    delete process.env.OPENROUTER_API_KEY;
  } else {
    process.env.OPENROUTER_API_KEY = originalOpenRouterApiKey;
  }

  if (originalOpenRouterModel === undefined) {
    delete process.env.OPENROUTER_MODEL;
  } else {
    process.env.OPENROUTER_MODEL = originalOpenRouterModel;
  }
});

function samplePreview(overrides = {}) {
  return normalizePreview(
    {
      title: 'Member Playtest Nights',
      submitted_by: '@forge_user',
      hook: 'A recurring night where Alchemists can test games, give useful feedback, and help creators improve what they are building.',
      vision: 'The idea is to create a reliable playtesting rhythm for members who are making games or supporting partner projects. It gives creators a friendly room to learn what is working, what is confusing, and where players feel the most energy.',
      why_it_matters: 'Good feedback is hard to get, especially for small teams and solo creators. The Alchemists already has gamers, builders, and supporters who can turn a casual test session into real momentum while staying focused on doing good for the people building.',
      how_it_could_work: [
        'Pick one member or partner project for each session.',
        'Have players share quick notes on fun, friction, bugs, and next ideas.',
        'Collect the feedback in one place so the creator can act on it.'
      ],
      why_it_fits_the_alchemists: 'It uses the community strengths we already talk about: gaming, creation, collaboration, feedback, and helping people turn passion into progress.',
      first_step: 'Choose one upcoming project and schedule a small pilot session with five to ten volunteers.',
      alignment_score: 5,
      relevance_status: 'Strong Fit',
      clear_connection: true,
      suggested_tweaks: [],
      ...overrides
    },
    'fallback_user'
  );
}

function rawPreview(overrides = {}) {
  return {
    title: 'Member Playtest Nights',
    submitted_by: '@forge_user',
    hook: 'A recurring night where Alchemists can test games and give useful feedback.',
    vision: 'Create a reliable playtesting rhythm for members who are making games or supporting partner projects.',
    why_it_matters: 'Small teams need useful feedback, and the community has players and builders who can help.',
    how_it_could_work: [
      'Pick one member or partner project for each session.',
      'Have players share quick notes on fun, friction, bugs, and next ideas.',
      'Collect the feedback in one place so the creator can act on it.'
    ],
    why_it_fits_the_alchemists: 'It connects gaming, creation, collaboration, feedback, and helping people make progress.',
    first_step: 'Choose one upcoming project and schedule a small pilot session.',
    alignment_score: 5,
    relevance_status: 'Strong Fit',
    clear_connection: true,
    suggested_tweaks: [],
    ...overrides
  };
}

function samplePayload(message = 'Create monthly co-op playtest nights for partner indie games.') {
  return {
    username: 'forge_user',
    messages: [
      {
        role: 'user',
        content: message
      }
    ]
  };
}

function mockOpenRouter(body, status = 200) {
  const requests = [];

  process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
  process.env.OPENROUTER_MODEL = 'test/model';
  global.fetch = async (url, options) => {
    requests.push({
      url,
      body: JSON.parse(options.body)
    });

    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body)
    };
  };

  return requests;
}

async function invokeJsonHandler(handler, body, headers = {}) {
  const response = {
    headers: {},
    statusCode: 200,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(payload) {
      this.payload = payload;
    }
  };

  await handler({
    method: 'POST',
    headers: {
      'x-real-ip': `test-${Date.now()}-${Math.random()}`,
      ...headers
    },
    socket: {},
    body
  }, response);

  return {
    statusCode: response.statusCode,
    headers: response.headers,
    body: JSON.parse(response.payload || '{}')
  };
}

function reportedGamesRatingPreview() {
  return normalizePreview(
    {
      title: 'A Games Rating Page Built by Alchemists, for Alchemists',
      submitted_by: '@blockonaut',
      hook: 'What if The Alchemists had its own games rating page, where every review came from a verified member who actually played the game?',
      vision: 'blockonaut is proposing a games rating page on The Alchemists website, inspired by sites like games.gg but with a clear twist: reviews come only from verified Alchemists members who have actually played the game. Partner games would get featured placement at the top of the page, along with extras like a dev blurb, links to their Discord and store page, trailers, tags, screenshots, and the best member reviews.',
      why_it_matters: 'Most rating sites are flooded with drive-by scores and review bombs, which makes it hard for gamers to trust them and hard for devs to stand out. A rating page where every reviewer is a known member with verified playtime gives the scores real weight. Gamers find their next game with confidence and devs get signal they can use.',
      how_it_could_work: [
        'Member-only reviews gated by a verified Discord role, with mods manually confirming the reviewer played the game.',
        'Discord-to-website connection (likely Discord OAuth) so member identity and roles carry over.',
        'Two clearly separated lanes on the page, Featured Partners at the top with dev blurbs, store links, and member scores.'
      ],
      why_it_fits_the_alchemists: 'This sits right in the playtesting, feedback, and game support lane that The Alchemists already cares about. It gives members a way to use their gaming hours and honest opinions to help other gamers and support devs we work with. It pulls in web and tooling builders for the Discord auth layer, moderation flow, and rating design.',
      first_step: 'blockonaut to draft a short one-pager listing the rating dimensions, the verified-role criteria, and the exact partner game info needed for a first mockup.',
      alignment_score: 5,
      relevance_status: 'Strong Fit',
      clear_connection: true,
      suggested_tweaks: []
    },
    'blockonaut'
  );
}

function messageBodyLines(message) {
  return message
    .split('\n')
    .map((line) => line.replace(/^- /, '').trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('#'))
    .filter((line) => !line.startsWith('Idea from:'))
    .filter((line) => !/^\*\*.*\*\*$/.test(line));
}

function assertNoChoppedLineEndings(message) {
  messageBodyLines(message).forEach((line) => {
    assert.doesNotMatch(line, /[,;:]$/);
    assert.doesNotMatch(
      line,
      /\b(?:a|an|and|are|as|at|be|but|by|for|from|in|is|of|on|or|our|so|that|the|their|to|was|were|where|which|while|who|with)$/i
    );
  });
}

test('collaborator prompt routes preview generation to the explicit button flow', () => {
  const messages = buildCollaboratorMessages({ messages: [] });
  const systemPrompt = messages[0].content;

  assert.match(systemPrompt, /Use the Generate Discord Post Preview button when you’re ready\./);
  assert.match(systemPrompt, /Chat is only for refining the idea/i);
  assert.match(systemPrompt, /Do NOT produce a long structured proposal, full Discord-ready post, or final Discord preview in chat\./);
  assert.doesNotMatch(systemPrompt, /explicitly ask to generate a Discord preview/i);
  assert.doesNotMatch(systemPrompt, /reply.*(?:generate|preview|post).*chat/i);
  assert.doesNotMatch(systemPrompt, /ask.*(?:generate|preview|post).*chat/i);
});

test('detects clear preview intent messages before chat submission', () => {
  [
    'generate the preview',
    'Generate Discord Post Preview',
    'please generate the discord post preview',
    'make the discord post',
    'make a discord post please',
    'post this to discord',
    'post it to the Discord',
    'post this to discord please',
    'post this to #vision-forge',
    'send it to Discord',
    'yes generate it',
    'yeah generate it now',
    "I'm ready",
    'I’m ready',
    'im ready to share',
    "we're ready for preview",
    "let's generate the preview",
    'can you create the preview for me?'
  ].forEach((message) => {
    assert.equal(isPreviewIntentMessage(message), true, message);
  });
});

test('does not treat normal refinement messages as preview intent', () => {
  [
    'Tighten this idea and make it more useful to members.',
    'How well does this align with The Alchemists vision?',
    'Can you make it more focused before we preview anything?',
    'I am ready to brainstorm a few more details.',
    'Help me write a better hook for a future Discord post.',
    'What are concrete next steps to move this idea forward?',
    'Maybe this could become a Discord event later.',
    'Please do not post this yet.'
  ].forEach((message) => {
    assert.equal(isPreviewIntentMessage(message), false, message);
  });
});

test('trims assistant replies at natural boundaries instead of chopping words', () => {
  const source = [
    'A Game Signal Engine could help members turn scattered community reactions into ranked collaboration leads.',
    'It should surface playtest interest, creator needs, partner game requests, and hunting paths before the team commits energy to hunting promising opportunities across channels.'
  ].join(' ');
  const maxLength = source.indexOf('hunting') + 'huntin'.length;
  const reply = sanitizeText(source, maxLength, {
    preserveNewlines: true,
    truncateAt: 'natural'
  });

  assert.ok(reply.length <= maxLength);
  assert.match(reply, /[.!?]$/);
  assert.doesNotMatch(reply, /\bhuntin$/i);
  assert.doesNotMatch(reply, /\b\w{3,}in$/i);
});

test('keeps longer assistant history while capping user messages at the user limit', () => {
  const assistantContent = 'Assistant context '.repeat(110);
  const userContent = 'u'.repeat(1800);
  const payload = validateChatPayload({
    username: 'forge_user',
    messages: [
      {
        role: 'assistant',
        content: assistantContent
      },
      {
        role: 'user',
        content: userContent
      }
    ]
  }, { requireConversation: true });

  assert.equal(payload.messages[0].role, 'assistant');
  assert.equal(payload.messages[0].content.length, assistantContent.trim().length);
  assert.ok(payload.messages[0].content.length > LIMITS.message);
  assert.ok(payload.messages[0].content.length <= LIMITS.assistantMessage);
  assert.equal(payload.messages[1].role, 'user');
  assert.equal(payload.messages[1].content.length, LIMITS.message);
});

test('chat endpoint returns a naturally capped reply with unchanged response shape', async () => {
  const longReply = [
    'A Game Signal Engine fits The Alchemists when it helps members turn scattered signals into practical collaboration choices.',
    'It should help people compare playtest interest, creator needs, partner game requests, and member skill matches before energy gets spent.',
    'Members can review signals, tag opportunities, route builders toward next steps, and keep attribution clear for the person who submitted the idea.'
  ].join(' ').repeat(12);
  const requests = mockOpenRouter({
    choices: [
      {
        message: {
          content: longReply
        }
      }
    ]
  });
  const response = await invokeJsonHandler(chatHandler, {
    username: 'forge_user',
    messages: [
      {
        role: 'user',
        content: 'Game Signal Engine: help The Alchemists spot the best community ideas to support next.'
      }
    ]
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(Object.keys(response.body).sort(), ['ok', 'reply']);
  assert.equal(response.body.ok, true);
  assert.ok(response.body.reply.length <= LIMITS.assistantMessage);
  assert.match(response.body.reply, /[.!?]$/);
  assert.equal(requests[0].body.max_tokens, 900);
});

test('formats the new Discord post without old memo headings', () => {
  const preview = samplePreview();
  const message = formatDiscordMessage(preview);

  assert.doesNotMatch(
    message,
    /Thread Prompt|Category|Summary|Community Value|Individual Member Value|Suggested Next Step|Alignment/
  );
  assert.match(message, /^# VISION-FORGE/);
  assert.match(message, /Idea from: @forge_user/);
  assert.doesNotMatch(message, /Idea from: @@/);
});

test('keeps the requested section order and fixed CTA ending', () => {
  const preview = samplePreview();
  const message = formatDiscordMessage(preview);
  const expectedOrder = [
    '# VISION-FORGE',
    'Idea from: @forge_user',
    'Member Playtest Nights',
    preview.hook,
    '**The Vision**',
    '**Why It Matters**',
    '**How It Could Work**',
    '**Why It Fits The Alchemists**',
    '**First Step**',
    DISCORD_CLOSING_LINES[0],
    DISCORD_CLOSING_LINES[1]
  ];

  let cursor = -1;
  expectedOrder.forEach((section) => {
    const index = message.indexOf(section);
    assert.ok(index > cursor, `${section} should appear after the previous section`);
    cursor = index;
  });

  assert.equal(message.split('\n').at(-1), DISCORD_CLOSING_LINES[1]);
  assert.ok(!message.trim().endsWith('?'));
});

test('fits the reported games rating preview without chopped sentences', () => {
  const message = formatDiscordMessage(reportedGamesRatingPreview());

  assert.ok(message.length <= MAX_DISCORD_MESSAGE_LENGTH);
  assertNoChoppedLineEndings(message);
  assert.match(message, /verified Alchemists members/i);
  assert.match(message, /verified playtime/i);
  assert.match(message, /Discord OAuth|Discord-to-website/i);
  assert.doesNotMatch(message, /trailers,\n|confidenc(?:\n|$)|carry ov(?:\n|$)|store l\n|moderatio|confirming the re\n/);
});

test('compacts oversized single-sentence fields cleanly into one Discord message', () => {
  const repeatedDetail = 'Members can test ideas, compare notes, support builders, and turn rough game feedback into practical next steps for creators and partner teams';
  const preview = samplePreview({
    hook: `${repeatedDetail} ${repeatedDetail} ${repeatedDetail}`,
    vision: `${repeatedDetail} ${repeatedDetail} ${repeatedDetail} ${repeatedDetail}`,
    why_it_matters: `${repeatedDetail} ${repeatedDetail} ${repeatedDetail} ${repeatedDetail}`,
    how_it_could_work: [
      `${repeatedDetail} ${repeatedDetail}`,
      `${repeatedDetail} ${repeatedDetail}`,
      `${repeatedDetail} ${repeatedDetail}`
    ],
    why_it_fits_the_alchemists: `${repeatedDetail} ${repeatedDetail} ${repeatedDetail} ${repeatedDetail}`,
    first_step: `${repeatedDetail} ${repeatedDetail} ${repeatedDetail}`
  });
  const message = formatDiscordMessage(preview);

  assert.ok(message.length <= MAX_DISCORD_MESSAGE_LENGTH);
  assertNoChoppedLineEndings(message);
  assert.doesNotMatch(message, /\b(?:practica|creato|partne|feedbac)$/i);
});

test('requires all new public fields before posting', () => {
  const missingHook = samplePreview({ hook: '' });
  const evaluatedMissingHook = evaluatePreview(missingHook, true);

  assert.equal(hasRequiredPreviewFields(missingHook), false);
  assert.equal(evaluatedMissingHook.can_post, false);
  assert.match(evaluatedMissingHook.posting_blocked_reason, /missing required Discord fields/);

  const missingBullet = samplePreview({
    how_it_could_work: ['Pick a project.', 'Collect feedback.']
  });
  const evaluatedMissingBullet = evaluatePreview(missingBullet, true);

  assert.equal(hasRequiredPreviewFields(missingBullet), false);
  assert.equal(evaluatedMissingBullet.can_post, false);
});

test('blocks old preview shapes that only contain removed fields', () => {
  const oldPreview = normalizePreview(
    {
      title: 'Old Shape',
      submitted_by: 'old_user',
      category: 'Community Idea',
      summary: 'Old summary.',
      why_it_matters: 'Old why.',
      community_value: 'Old community value.',
      individual_member_value: 'Old individual value.',
      suggested_next_step: 'Old next step.',
      thread_prompt: 'Old question?',
      alignment_score: 5,
      relevance_status: 'Strong Fit',
      clear_connection: true,
      suggested_tweaks: []
    },
    'old_user'
  );
  const evaluated = evaluatePreview(oldPreview, true);

  assert.equal(hasRequiredPreviewFields(oldPreview), false);
  assert.equal(evaluated.can_post, false);
});

test('parses fenced JSON preview content', () => {
  const parsed = parsePreviewContent(`\`\`\`json
${JSON.stringify(rawPreview())}
\`\`\``);

  assert.equal(parsed.rawPreview.title, 'Member Playtest Nights');
  assert.deepEqual(parsed.fallbackReasons, []);
  assert.deepEqual(parsed.parseNotes, ['direct_json']);
});

test('extracts JSON preview content surrounded by extra text', () => {
  const parsed = parsePreviewContent(`Here is the preview:

${JSON.stringify(rawPreview({ title: 'Creator Feedback Sprint' }))}

Hope this helps.`);

  assert.equal(parsed.rawPreview.title, 'Creator Feedback Sprint');
  assert.deepEqual(parsed.fallbackReasons, []);
  assert.deepEqual(parsed.parseNotes, ['embedded_json']);
});

test('normalizes camelCase fields and fills missing preview fields without allowing posting', () => {
  const parsed = parsePreviewContent(JSON.stringify({
    title: 'Creator Build Night',
    submittedBy: 'forge_user',
    hook: 'A focused build night for creators to get help from the community.',
    vision: 'Members bring work in progress and leave with feedback, fixes, and useful next steps.',
    whyItMatters: 'Creators move faster when they can get practical help from people with different skills.',
    howItCouldWork: ['Pick one creator project for the session.'],
    whyItFitsTheAlchemists: 'It supports gaming, creation, collaboration, and member skill sharing.',
    alignmentScore: 4,
    relevanceStatus: 'Strong Fit',
    clearConnection: true
  }));
  const completed = completePreview(parsed.rawPreview, samplePayload());
  const evaluated = evaluatePreview(completed.preview, completed.rawClearConnection);

  assert.equal(completed.preview.why_it_matters.includes('Creators move faster'), true);
  assert.equal(completed.preview.how_it_could_work.length, 3);
  assert.equal(completed.preview.relevance_status, 'Needs Refinement');
  assert.equal(completed.preview.required_fields_synthesized, true);
  assert.equal(evaluated.can_post, false);
  assert.match(evaluated.posting_blocked_reason, /safe fallback preview/);
});

test('falls back from malformed plain text model output and keeps Discord section style', async () => {
  const requests = mockOpenRouter({
    choices: [
      {
        message: {
          content: 'Weekly playtest nights where members help partner indie games find bugs and better ideas.'
        }
      }
    ]
  });
  const preview = await generatePreview(samplePayload());
  const message = formatDiscordMessage(preview);

  assert.equal(requests[0].body.response_format, undefined);
  assert.equal(preview.can_post, false);
  assert.equal(preview.relevance_status, 'Needs Refinement');
  assert.equal(preview.clear_connection, false);
  assert.deepEqual(preview.preview_fallback_reasons, [
    'malformed_model_content',
    'synthesized_required_fields'
  ]);
  assert.match(message, /^# VISION-FORGE/);
  assert.match(message, /\*\*The Vision\*\*/);
  assert.match(message, /\*\*How It Could Work\*\*/);
  assert.doesNotMatch(message, /Thread Prompt|Category|Summary|Community Value/);
});

test('falls back from an empty model response', async () => {
  mockOpenRouter({
    choices: [
      {
        message: {
          content: ''
        }
      }
    ]
  });
  const preview = await generatePreview(samplePayload('Run a skill-sharing workshop for new community builders.'));

  assert.equal(preview.can_post, false);
  assert.equal(preview.title, 'Run a skill-sharing workshop for new community builders');
  assert.equal(preview.how_it_could_work.length, 3);
  assert.deepEqual(preview.preview_fallback_reasons, [
    'empty_model_response',
    'synthesized_required_fields'
  ]);
});

test('returns a controlled error when OpenRouter responds non-200', async () => {
  mockOpenRouter({
    error: {
      message: 'rate limited'
    }
  }, 429);

  await assert.rejects(
    () => generatePreview(samplePayload()),
    (error) => {
      assert.equal(error.name, 'ApiError');
      assert.equal(error.statusCode, 502);
      assert.equal(error.details.upstream_status, 429);
      assert.equal(error.message, 'Vision Forge AI returned an error. Try again shortly.');
      return true;
    }
  );
});
