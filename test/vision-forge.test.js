const assert = require('node:assert/strict');
const test = require('node:test');

const {
  DISCORD_CLOSING_LINES,
  formatDiscordMessage
} = require('../server/vision-forge/discord');
const { evaluatePreview } = require('../server/vision-forge/preview');
const {
  hasRequiredPreviewFields,
  normalizePreview
} = require('../server/vision-forge/validation');

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
