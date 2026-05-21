const assert = require('node:assert/strict');
const test = require('node:test');

const {
  DISCORD_CLOSING_LINES,
  formatDiscordMessage
} = require('../server/vision-forge/discord');
const {
  completePreview,
  evaluatePreview,
  generatePreview,
  parsePreviewContent
} = require('../server/vision-forge/preview');
const {
  hasRequiredPreviewFields,
  normalizePreview
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
