const { randomUUID } = require('node:crypto');
const {
  existsSync,
  readFileSync,
  unlinkSync,
  writeFileSync
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { uniqueSlug } = require('./slug');

const records = new Map();
const sampleInterestCounts = new Map();
const STORE_PATH = process.env.GAME_SIGNAL_STORE_PATH || join(tmpdir(), 'alchemists-game-signals.json');

const SAMPLE_SIGNALS = [
  {
    id: 'sample-example-frontier',
    slug: 'example-frontier',
    title: 'Example Frontier Playtest Signal',
    submitted_by: 'signal_scout',
    game_title: 'Example Frontier',
    game_url: 'https://example.com/frontier',
    signal_type: 'upcoming-playtest',
    summary: 'Sample signal for a small online RPG looking for focused combat feedback, onboarding notes, and a few reliable testers from The Alchemists.',
    what_to_watch: 'First-session onboarding, early combat feel, progression pacing, and whether the public test window is ready for wider member attention.',
    notes: 'Sample data shown until real signals are submitted.',
    status: 'published',
    sample_signal: true,
    sample_note: 'Sample data shown until real signals are submitted.',
    interest_count: 4,
    reaction_count: 2,
    threshold: 2,
    created_at: '2026-05-01T14:00:00.000Z',
    updated_at: '2026-05-02T16:30:00.000Z',
    published_at: '2026-05-02T16:30:00.000Z',
    refined: {
      title: 'Example Frontier Playtest Signal',
      short_summary: 'A small RPG team needs sharp Alchemists feedback before its next public test.',
      why_it_matters: 'Useful early feedback helps the team improve before more players arrive and gives Alchemists a practical way to support a builder-friendly game.',
      what_to_watch: [
        'First-session onboarding and quest clarity.',
        'Combat feel during early RPG encounters.',
        'Progression pacing before the public test.'
      ],
      possible_member_interest: 'RPG players, testers, note-takers, content creators, and members who like helping small game teams.',
      creator_angles: [
        'Short clips that show onboarding friction and combat feel.',
        'A before-and-after feedback story if the next build improves.'
      ],
      research_notes: [
        'Confirm the next public test timing.',
        'Check whether the team has a preferred feedback channel.'
      ],
      next_step: 'Recruit five testers and schedule one Discord playtest block.',
      tags: ['upcoming-playtest', 'rpg', 'feedback']
    }
  },
  {
    id: 'sample-emberlight-arena',
    slug: 'emberlight-arena',
    title: 'Emberlight Arena Creator Push',
    submitted_by: 'guild_builder',
    game_title: 'Emberlight Arena',
    game_url: 'https://example.com/emberlight',
    signal_type: 'creator-opportunity-around-a-game',
    summary: 'Sample signal for a competitive arena game that could benefit from short-form creator clips and match-night community energy.',
    what_to_watch: 'New mode moments that clip well, competitive readability, spectator clarity, and creator prompts members could test during match night.',
    notes: 'Sample data shown until real signals are submitted.',
    status: 'published',
    sample_signal: true,
    sample_note: 'Sample data shown until real signals are submitted.',
    interest_count: 3,
    reaction_count: 2,
    threshold: 2,
    created_at: '2026-05-03T18:00:00.000Z',
    updated_at: '2026-05-04T18:30:00.000Z',
    published_at: '2026-05-04T18:30:00.000Z',
    refined: {
      title: 'Emberlight Arena Creator Push',
      short_summary: 'A new arena mode gives Alchemists creators a clear reason to rally around clips and match nights.',
      why_it_matters: 'Creator energy can help a promising game find real players while giving members an easy way to contribute their strengths.',
      what_to_watch: [
        'New mode moments that clip well.',
        'Competitive match flow and spectator clarity.',
        'Creator prompts that make the game easier to share.'
      ],
      possible_member_interest: 'Competitive players, streamers, editors, event hosts, and social-first creators.',
      creator_angles: [
        'Clip bundles around the cleanest new-mode moments.',
        'A community match-night recap with standout plays.'
      ],
      research_notes: [
        'Confirm the new mode release window.',
        'Check whether spectator tools or replay capture are available.'
      ],
      next_step: 'Pick a match-night date and recruit creators who can capture highlights.',
      tags: ['creator-opportunity-around-a-game', 'arena', 'clips']
    }
  },
  {
    id: 'sample-neon-relic',
    slug: 'neon-relic-alpha-watch',
    title: 'Neon Relic Alpha Watch',
    submitted_by: 'alpha_scout',
    game_title: 'Neon Relic',
    game_url: 'https://example.com/neon-relic',
    signal_type: 'alpha-beta-access',
    summary: 'Sample signal for a sci-fi extraction game opening a small alpha window that Alchemists members could watch, test, and report on.',
    what_to_watch: 'Extraction loop clarity, first-session tension, squad coordination, matchmaking, combat readability, and whether the alpha supports scout reports.',
    notes: 'Sample data shown until real signals are submitted.',
    status: 'published',
    sample_signal: true,
    sample_note: 'Sample data shown until real signals are submitted.',
    interest_count: 5,
    reaction_count: 2,
    threshold: 2,
    created_at: '2026-05-05T18:00:00.000Z',
    updated_at: '2026-05-06T18:30:00.000Z',
    published_at: '2026-05-06T18:30:00.000Z',
    refined: {
      title: 'Neon Relic Alpha Watch',
      short_summary: 'A new sci-fi extraction alpha gives Alchemists a clean chance to scout the game early.',
      why_it_matters: 'Early access lets Alchemists decide whether this is worth deeper playtesting, content, or competitive squad formation.',
      what_to_watch: [
        'Extraction loop clarity and first-session tension.',
        'Squad coordination, matchmaking, and combat readability.',
        'Moments that could support clips or alpha reports.'
      ],
      possible_member_interest: 'Extraction fans, squad callers, testers, sci-fi creators, and members who like evaluating early builds.',
      creator_angles: [
        'First-session alpha impressions from a scout squad.',
        'Short clips of extraction tension and standout systems.'
      ],
      research_notes: [
        'Confirm alpha key timing and access rules.',
        'Check whether squad matchmaking supports coordinated testing.'
      ],
      next_step: 'Collect alpha interest and form one scout squad if keys open.',
      tags: ['alpha-beta-access', 'extraction', 'squad']
    }
  }
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function hydrateRecords() {
  if (!existsSync(STORE_PATH)) return;

  try {
    const parsed = JSON.parse(readFileSync(STORE_PATH, 'utf8'));
    if (!Array.isArray(parsed)) return;

    records.clear();
    parsed.forEach((signal) => {
      if (signal && signal.slug) records.set(signal.slug, signal);
    });
  } catch (error) {
    /* Keep process memory if the local backing file is unavailable or malformed. */
  }
}

function persistRecords() {
  try {
    writeFileSync(STORE_PATH, JSON.stringify(Array.from(records.values()), null, 2));
  } catch (error) {
    /* Process memory remains the source of truth for this request. */
  }
}

function recordExists(slug) {
  hydrateRecords();
  return records.has(slug) || SAMPLE_SIGNALS.some((signal) => signal.slug === slug);
}

function statusLabel(status) {
  if (status === 'published') return 'Published';
  if (status === 'community_approved') return 'Community approved';
  if (status === 'ai_refined') return 'Community review';
  if (status === 'submitted') return 'Submitted';
  return 'Draft';
}

function publicSignal(signal) {
  const copy = clone(signal);
  const sampleInterest = sampleInterestCounts.get(copy.slug);

  if (copy.sample_signal && Number.isFinite(sampleInterest)) {
    copy.interest_count = sampleInterest;
  }

  return {
    ...copy,
    status_label: statusLabel(copy.status),
    public_path: `/games/${copy.slug}`
  };
}

function listSignals() {
  hydrateRecords();
  const realSignals = Array.from(records.values())
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));

  if (realSignals.length) {
    return realSignals.map(publicSignal);
  }

  return SAMPLE_SIGNALS.map(publicSignal);
}

function getSignal(slug) {
  hydrateRecords();
  if (records.has(slug)) return publicSignal(records.get(slug));

  const sample = SAMPLE_SIGNALS.find((signal) => signal.slug === slug);
  return sample ? publicSignal(sample) : null;
}

function createSubmittedSignal(submission, options = {}) {
  hydrateRecords();
  const timestamp = nowIso();
  const baseSlug = options.slug || submission.game_title;
  const slug = uniqueSlug(baseSlug, recordExists);
  const signal = {
    id: randomUUID(),
    slug,
    title: submission.game_title,
    submitted_by: submission.submitted_by,
    game_title: submission.game_title,
    game_url: submission.game_url,
    signal_type: submission.signal_type,
    summary: submission.summary,
    what_to_watch: submission.what_to_watch,
    notes: submission.notes,
    status: 'submitted',
    sample_signal: false,
    interest_count: 0,
    reaction_count: 0,
    threshold: options.threshold || 2,
    created_at: timestamp,
    updated_at: timestamp,
    published_at: '',
    refined: null,
    ai: {
      model: '',
      refined_at: '',
      error: ''
    },
    discord: {
      posted_at: '',
      error: ''
    }
  };

  records.set(slug, signal);
  persistRecords();
  return publicSignal(signal);
}

function updateSignal(slug, patch) {
  hydrateRecords();
  const current = records.get(slug);
  if (!current) return null;

  const updated = {
    ...current,
    ...patch,
    refined: patch.refined === undefined ? current.refined : patch.refined,
    ai: patch.ai ? { ...current.ai, ...patch.ai } : current.ai,
    discord: patch.discord ? { ...current.discord, ...patch.discord } : current.discord,
    updated_at: nowIso()
  };

  records.set(slug, updated);
  persistRecords();
  return publicSignal(updated);
}

function incrementInterest(slug) {
  hydrateRecords();
  const current = records.get(slug);

  if (current) {
    current.interest_count += 1;
    current.updated_at = nowIso();
    records.set(slug, current);
    persistRecords();
    return publicSignal(current);
  }

  const sample = SAMPLE_SIGNALS.find((signal) => signal.slug === slug);
  if (!sample) return null;

  const next = (sampleInterestCounts.get(slug) || sample.interest_count || 0) + 1;
  sampleInterestCounts.set(slug, next);
  return publicSignal(sample);
}

function setReactionCount(slug, reactionCount) {
  return updateSignal(slug, {
    reaction_count: reactionCount
  });
}

function markCommunityApproved(slug) {
  const current = records.get(slug);
  if (!current) return null;

  if (current.status === 'published') return publicSignal(current);

  return updateSignal(slug, {
    status: 'community_approved'
  });
}

function publishSignal(slug) {
  const current = records.get(slug);
  if (!current) return null;

  const timestamp = nowIso();
  return updateSignal(slug, {
    status: 'published',
    published_at: current.published_at || timestamp
  });
}

function resetStoreForTests() {
  records.clear();
  sampleInterestCounts.clear();
  try {
    unlinkSync(STORE_PATH);
  } catch (error) {
    /* Nothing to reset. */
  }
}

module.exports = {
  createSubmittedSignal,
  getSignal,
  incrementInterest,
  listSignals,
  markCommunityApproved,
  publicSignal,
  publishSignal,
  resetStoreForTests,
  setReactionCount,
  updateSignal
};
