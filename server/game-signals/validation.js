const { ApiError } = require('../shared/errors');
const {
  sanitizeDiscordName,
  sanitizeText,
  sanitizeUrl
} = require('../shared/validation');

const LIMITS = {
  submittedBy: 80,
  gameTitle: 120,
  summary: 900,
  whatToWatch: 700,
  notes: 700,
  link: 500
};

const SIGNAL_TYPES = [
  'early-game-discovery',
  'upcoming-playtest',
  'alpha-beta-access',
  'new-game-launch',
  'game-update-worth-watching',
  'creator-opportunity-around-a-game',
  'competitive-tournament-opportunity',
  'web3-game-campaign',
  'community-requested-game',
  'other-game-signal'
];

function validateHoneypot(body) {
  const trap = sanitizeText(
    body.honeypot || body.website || body.company || body.forge_signal || '',
    120
  );

  if (trap) {
    throw new ApiError(400, 'Game Signal Engine could not accept this request.');
  }
}

function normalizeSignalType(value) {
  const normalized = sanitizeText(value, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-');

  if (!SIGNAL_TYPES.includes(normalized)) {
    throw new ApiError(400, 'Choose a game-specific signal type.');
  }

  return normalized;
}

function validateGameSignalSubmission(body = {}) {
  validateHoneypot(body);

  const submittedBy = sanitizeDiscordName(body.submitted_by || body.submittedBy || body.username);
  const gameTitle = sanitizeText(body.game_title || body.gameTitle || body.title, LIMITS.gameTitle, {
    truncateAt: 'natural',
    terminalPunctuation: false
  });
  const gameUrl = sanitizeUrl(body.game_url || body.gameUrl || body.url, LIMITS.link);
  const signalType = normalizeSignalType(body.signal_type || body.signalType);
  const summary = sanitizeText(body.summary || body.pitch || body.description, LIMITS.summary, {
    preserveNewlines: true,
    truncateAt: 'natural'
  });
  const whatToWatch = sanitizeText(body.what_to_watch || body.whatToWatch, LIMITS.whatToWatch, {
    preserveNewlines: true,
    truncateAt: 'natural'
  });
  const notes = sanitizeText(body.notes, LIMITS.notes, {
    preserveNewlines: true,
    truncateAt: 'natural'
  });

  if (submittedBy.length < 2) {
    throw new ApiError(400, 'Add your Discord username before submitting a signal.');
  }

  if (gameTitle.length < 2) {
    throw new ApiError(400, 'Add the game name.');
  }

  if (!gameUrl) {
    throw new ApiError(400, 'Add a valid game link.');
  }

  if (summary.length < 20) {
    throw new ApiError(400, 'Add a little more detail about the signal.');
  }

  if (whatToWatch.length < 8) {
    throw new ApiError(400, 'Add what Alchemists should watch for.');
  }

  return {
    submitted_by: submittedBy,
    game_title: gameTitle,
    game_url: gameUrl,
    signal_type: signalType,
    summary,
    what_to_watch: whatToWatch,
    notes
  };
}

function validateSlugInput(value) {
  const slug = sanitizeText(value, 96).toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  if (!slug) throw new ApiError(400, 'A signal slug is required.');
  return slug;
}

function validateReactionCount(value) {
  const count = Number(value);
  if (!Number.isFinite(count) || count < 0) {
    throw new ApiError(400, 'Reaction count must be a non-negative number.');
  }

  return Math.floor(count);
}

module.exports = {
  LIMITS,
  SIGNAL_TYPES,
  normalizeSignalType,
  validateGameSignalSubmission,
  validateReactionCount,
  validateSlugInput
};
