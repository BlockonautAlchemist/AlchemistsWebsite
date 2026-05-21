const assert = require('node:assert/strict');
const test = require('node:test');

const interestHandler = require('../api/game-signals/interest');
const publishHandler = require('../api/game-signals/publish');
const submitHandler = require('../api/game-signals/submit');
const { DEFAULT_MODEL, configuredModel } = require('../server/shared/openRouter');
const {
  MAX_DISCORD_MESSAGE_LENGTH,
  formatDiscordSignalMessage
} = require('../server/game-signals/discord');
const {
  fallbackRefinement,
  normalizeRefinement,
  parseRefinementContent
} = require('../server/game-signals/refinement');
const {
  createSubmittedSignal,
  getSignal,
  resetStoreForTests,
  updateSignal
} = require('../server/game-signals/storage');
const {
  DEFAULT_REACTION_THRESHOLD,
  autoPublishEnabled,
  hasMetReactionThreshold,
  reactionThreshold
} = require('../server/game-signals/threshold');
const {
  SIGNAL_TYPES,
  validateGameSignalSubmission
} = require('../server/game-signals/validation');
const { slugifyGameSignal, uniqueSlug } = require('../server/game-signals/slug');
const { resetRateLimitsForTests } = require('../server/shared/rateLimit');

const originalEnv = {
  GAME_SIGNAL_PUBLISH_SECRET: process.env.GAME_SIGNAL_PUBLISH_SECRET,
  GAME_SIGNAL_REACTION_THRESHOLD: process.env.GAME_SIGNAL_REACTION_THRESHOLD,
  GAME_SIGNAL_AUTO_PUBLISH: process.env.GAME_SIGNAL_AUTO_PUBLISH,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
  GAME_SIGNAL_DISCORD_WEBHOOK_URL: process.env.GAME_SIGNAL_DISCORD_WEBHOOK_URL
};
const originalFetch = global.fetch;

test.afterEach(() => {
  resetStoreForTests();
  resetRateLimitsForTests();
  global.fetch = originalFetch;

  Object.entries(originalEnv).forEach(([key, value]) => {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  });
});

function sampleSubmission(overrides = {}) {
  return validateGameSignalSubmission({
    submitted_by: '@signal_scout',
    game_title: 'Frontier Signal',
    game_url: 'https://example.com/game?ref=alchemy#details',
    signal_type: 'upcoming-playtest',
    summary: 'A promising RPG team is looking for focused onboarding, combat, and progression feedback from reliable players.',
    what_to_watch: 'First-session onboarding, combat readability, progression pacing, and whether the test window is ready for a wider Alchemists watch.',
    notes: 'The team has a public test coming up and wants sharper notes before more players arrive.',
    ...overrides
  });
}

function signalForDiscord() {
  const submission = sampleSubmission();
  let signal = createSubmittedSignal(submission);
  const refined = normalizeRefinement({
    title: 'Frontier Signal Playtest',
    short_summary: 'A promising RPG team needs focused Alchemists feedback before a public test.',
    why_it_matters: 'Good notes now can help the team improve before a wider audience arrives.',
    what_to_watch: [
      'First-session onboarding and tutorial clarity.',
      'Combat feel during the opening quests.',
      'Progression pacing before the public test.'
    ],
    possible_member_interest: 'RPG players, testers, note-takers, and members who like supporting small teams.',
    creator_angles: [
      'Before-and-after clips if the next build improves.',
      'Short feedback recaps from testers.'
    ],
    research_notes: [
      'Confirm public test timing.',
      'Check the preferred feedback channel.'
    ],
    next_step: 'Recruit five testers and schedule a Discord playtest.',
    tags: ['upcoming-playtest', 'rpg']
  }, submission);

  signal = updateSignal(signal.slug, {
    status: 'ai_refined',
    refined
  });

  return signal;
}

async function invokeJsonHandler(handler, body, options = {}) {
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
    method: options.method || 'POST',
    headers: {
      'x-real-ip': `test-${Date.now()}-${Math.random()}`,
      ...(options.headers || {})
    },
    socket: {},
    query: options.query || {},
    url: options.url || '/api/game-signals/test',
    body
  }, response);

  return {
    statusCode: response.statusCode,
    headers: response.headers,
    body: JSON.parse(response.payload || '{}')
  };
}

function mockOpenRouterRefinement(content, status = 200) {
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
      text: async () => JSON.stringify({
        choices: [
          {
            message: {
              content: typeof content === 'string' ? content : JSON.stringify(content)
            }
          }
        ]
      })
    };
  };

  return requests;
}

test('validates game signal submissions and sanitizes unsafe URLs', () => {
  const payload = sampleSubmission();

  assert.equal(payload.submitted_by, 'signal_scout');
  assert.equal(payload.game_url, 'https://example.com/game?ref=alchemy');
  assert.equal(payload.what_to_watch, 'First-session onboarding, combat readability, progression pacing, and whether the test window is ready for a wider Alchemists watch.');
  assert.equal(payload.notes, 'The team has a public test coming up and wants sharper notes before more players arrive.');
  assert.equal(payload.signal_type, 'upcoming-playtest');
  assert.equal(Object.hasOwn(payload, 'contact'), false);
  assert.equal(Object.hasOwn(payload, 'audience'), false);
  assert.equal(Object.hasOwn(payload, 'support_needed'), false);
  assert.equal(Object.hasOwn(payload, 'links'), false);

  assert.throws(
    () => sampleSubmission({ summary: 'too short' }),
    /little more detail/
  );

  assert.throws(
    () => sampleSubmission({ game_url: '' }),
    /valid game link/
  );

  assert.throws(
    () => sampleSubmission({ what_to_watch: '' }),
    /what Alchemists should watch/
  );
});

test('accepts only game-specific signal types', () => {
  SIGNAL_TYPES.forEach((signalType) => {
    assert.equal(sampleSubmission({ signal_type: signalType }).signal_type, signalType);
  });

  [
    'partner_lead',
    'partner-lead',
    'tooling',
    'research',
    'community_event',
    'community-event',
    'generic_creator_support',
    'creator-support',
    'unknown-signal'
  ].forEach((signalType) => {
    assert.throws(
      () => sampleSubmission({ signal_type: signalType }),
      (error) => error.statusCode === 400 && /game-specific signal type/i.test(error.message)
    );
  });
});

test('generates stable unique slugs', () => {
  assert.equal(slugifyGameSignal('Frontier Signal: Alpha Test!'), 'frontier-signal-alpha-test');

  const seen = new Set(['frontier-signal', 'frontier-signal-2']);
  assert.equal(uniqueSlug('Frontier Signal', (slug) => seen.has(slug)), 'frontier-signal-3');
});

test('parses OpenRouter JSON content and reports fallback cases', () => {
  const direct = parseRefinementContent(JSON.stringify({
    title: 'Creator Sprint',
    possibleMemberInterest: 'Creators and testers.',
    creatorAngles: ['Host a night.', 'Capture clips.', 'Send notes.']
  }));

  assert.equal(direct.rawRefinement.title, 'Creator Sprint');
  assert.deepEqual(direct.parseNotes, ['direct_json']);
  assert.equal(direct.rawRefinement.possible_member_interest, 'Creators and testers.');
  assert.deepEqual(direct.rawRefinement.creator_angles, ['Host a night.', 'Capture clips.', 'Send notes.']);

  const fenced = parseRefinementContent(`\`\`\`json
${JSON.stringify({ signalTitle: 'Fenced Signal' })}
\`\`\``);
  assert.equal(fenced.rawRefinement.title, 'Fenced Signal');
  assert.deepEqual(fenced.parseNotes, ['direct_json']);

  const malformed = parseRefinementContent('Here is a pretty good idea, but not JSON.');
  assert.equal(malformed.rawRefinement, null);
  assert.deepEqual(malformed.fallbackReasons, ['malformed_model_content']);
});

test('normalizes refinement with deterministic fallback fields', () => {
  const submission = sampleSubmission();
  const fallback = fallbackRefinement(submission);
  const normalized = normalizeRefinement({
    short_summary: 'A useful RPG test window.',
    creator_angles: ['Collect combat notes.']
  }, submission);

  assert.equal(normalized.title, fallback.title);
  assert.equal(normalized.short_summary, 'A useful RPG test window.');
  assert.equal(normalized.what_to_watch.length, 3);
  assert.equal(normalized.creator_angles.length, 3);
  assert.equal(normalized.research_notes.length, 2);
  assert.ok(normalized.possible_member_interest);
  assert.ok(normalized.tags.includes('upcoming-playtest'));
});

test('uses the low-cost OpenRouter fallback model for shared game signal calls', () => {
  delete process.env.OPENROUTER_MODEL;
  assert.equal(DEFAULT_MODEL, 'openai/gpt-4o-mini');
  assert.equal(configuredModel(), 'openai/gpt-4o-mini');
});

test('formats Discord signal previews inside one message', () => {
  const message = formatDiscordSignalMessage(signalForDiscord());

  assert.ok(message.length <= MAX_DISCORD_MESSAGE_LENGTH);
  assert.match(message, /^New Game Signal: Frontier Signal/);
  assert.match(message, /\*\*Signal Type\*\*\nUpcoming Playtest/);
  assert.match(message, /\*\*Submitted By\*\*\n@signal_scout/);
  assert.match(message, /\*\*Why Alchemists Should Watch\*\*/);
  assert.match(message, /\*\*What To Watch\*\*/);
  assert.match(message, /\*\*Game Link\*\*\nhttps:\/\/example.com\/game\?ref=alchemy/);
  assert.match(message, /\*\*Community Vote\*\*/);
  assert.match(message, /\*\*Threshold\*\*\n2 reactions needed for community approval\./);
  assert.doesNotMatch(message, /Contact|Best Fit Members|Support Needed|Extra|Game Links|Watchlist|How Alchemists Can Help|# GAME SIGNAL|Opportunity/);
  assert.doesNotMatch(message, /undefined|null|OPENROUTER|WEBHOOK/);
});

test('uses threshold defaults, env override, and auto-publish flag', () => {
  delete process.env.GAME_SIGNAL_REACTION_THRESHOLD;
  delete process.env.GAME_SIGNAL_AUTO_PUBLISH;

  assert.equal(reactionThreshold(), DEFAULT_REACTION_THRESHOLD);
  assert.equal(hasMetReactionThreshold(2), true);
  assert.equal(autoPublishEnabled(), false);

  process.env.GAME_SIGNAL_REACTION_THRESHOLD = 'not-a-number';
  assert.equal(reactionThreshold(), DEFAULT_REACTION_THRESHOLD);
  assert.equal(hasMetReactionThreshold(2), true);

  process.env.GAME_SIGNAL_REACTION_THRESHOLD = '0';
  assert.equal(reactionThreshold(), DEFAULT_REACTION_THRESHOLD);

  process.env.GAME_SIGNAL_REACTION_THRESHOLD = '4';
  process.env.GAME_SIGNAL_AUTO_PUBLISH = 'true';

  assert.equal(reactionThreshold(), 4);
  assert.equal(hasMetReactionThreshold(3), false);
  assert.equal(hasMetReactionThreshold(4), true);
  assert.equal(autoPublishEnabled(), true);
});

test('protects the publish route and publishes authorized signals', async () => {
  process.env.GAME_SIGNAL_PUBLISH_SECRET = 'test-secret';
  const signal = createSubmittedSignal(sampleSubmission());

  const rejected = await invokeJsonHandler(publishHandler, {
    slug: signal.slug,
    force: true
  });

  assert.equal(rejected.statusCode, 401);
  assert.equal(rejected.body.ok, false);

  const accepted = await invokeJsonHandler(
    publishHandler,
    {
      slug: signal.slug,
      force: true
    },
    {
      headers: {
        authorization: 'Bearer test-secret'
      }
    }
  );

  assert.equal(accepted.statusCode, 200);
  assert.equal(accepted.body.ok, true);
  assert.equal(accepted.body.published, true);
  assert.equal(accepted.body.signal.status, 'published');
  assert.equal(getSignal(signal.slug).status, 'published');
});

test('increments interest through the API without publishing', async () => {
  const signal = createSubmittedSignal(sampleSubmission());

  const response = await invokeJsonHandler(interestHandler, {
    slug: signal.slug
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.signal.interest_count, 1);
  assert.equal(response.body.signal.status, 'submitted');
});

test('submit route saves a validated signal when AI is not configured', async () => {
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.GAME_SIGNAL_DISCORD_WEBHOOK_URL;

  const response = await invokeJsonHandler(submitHandler, {
    submitted_by: 'signal_scout',
    game_title: 'Missing AI Key Test',
    game_url: 'https://example.com/missing-ai-key-test',
    signal_type: 'early-game-discovery',
    summary: 'A promising game discovery that needs members to inspect the loop, compare the public links, and decide whether it is worth a wider watch.',
    what_to_watch: 'Scout notes, gameplay references, current community traction, and whether the game is worth a wider Alchemists watch.',
    notes: 'Optional scout context only.'
  });

  assert.equal(response.statusCode, 202);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.signal.status, 'submitted');
  assert.equal(response.body.signal.what_to_watch, 'Scout notes, gameplay references, current community traction, and whether the game is worth a wider Alchemists watch.');
  assert.equal(response.body.signal.notes, 'Optional scout context only.');
  assert.equal(Object.hasOwn(response.body.signal, 'support_needed'), false);
  assert.equal(Object.hasOwn(response.body.signal, 'audience'), false);
  assert.equal(Object.hasOwn(response.body.signal, 'links'), false);
  assert.match(response.body.warnings[0], /AI refinement is not configured/);
  assert.doesNotMatch(JSON.stringify(response.body), /OPENROUTER_API_KEY|test-secret/);
});

test('submit route rejects AI-marked non-game submissions before saving or posting', async () => {
  process.env.GAME_SIGNAL_DISCORD_WEBHOOK_URL = 'https://discord.example/webhook';
  const requests = mockOpenRouterRefinement({
    valid_game_signal: false,
    validation_reason: 'This is not a game The Alchemists should watch.'
  });

  const response = await invokeJsonHandler(submitHandler, {
    submitted_by: 'signal_scout',
    game_title: 'CRM Pipeline',
    game_url: 'https://example.com/crm-pipeline',
    signal_type: 'other-game-signal',
    summary: 'A workflow tool for tracking sponsor outreach and internal status updates, not a game for members to watch.',
    what_to_watch: 'Internal CRM fields, spreadsheet automation, and sponsor pipeline reports instead of any playable game signal.'
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.ok, false);
  assert.match(response.body.error, /not a game/i);
  assert.deepEqual(response.body.details, { validation: 'non_game_signal' });
  assert.equal(getSignal('crm-pipeline'), null);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.response_format.type, 'json_object');
});
