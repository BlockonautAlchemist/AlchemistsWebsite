const { ApiError } = require('../shared/errors');
const {
  callOpenRouter,
  configuredModel
} = require('../shared/openRouter');
const {
  sanitizeText
} = require('../shared/validation');
const { buildRefinementMessages } = require('./prompts');

const FIELD_ALIASES = {
  valid_game_signal: ['valid_game_signal', 'validGameSignal', 'valid game signal', 'is_game_signal', 'isGameSignal'],
  validation_reason: ['validation_reason', 'validationReason', 'validation reason', 'invalid_reason', 'invalidReason', 'reason'],
  title: ['title', 'name', 'signalTitle', 'signal_title', 'gameTitle', 'game_title'],
  short_summary: ['short_summary', 'shortSummary', 'short summary', 'summary', 'overview', 'description', 'opportunity', 'hook', 'headline', 'tagline', 'oneLine', 'one_line', 'signal'],
  why_it_matters: ['why_it_matters', 'whyItMatters', 'why it matters', 'impact', 'importance'],
  possible_member_interest: ['possible_member_interest', 'possibleMemberInterest', 'possible member interest', 'member_interest', 'memberInterest', 'member interest', 'best_fit', 'bestFit', 'best fit', 'audience', 'whoFor', 'who_for'],
  what_to_watch: ['what_to_watch', 'whatToWatch', 'what to watch', 'watch', 'watch_points', 'watchPoints', 'watchlist'],
  creator_angles: ['creator_angles', 'creatorAngles', 'creator angles', 'content_angles', 'contentAngles', 'content angles', 'creator', 'creators', 'angles', 'how_alchemists_can_help', 'howAlchemistsCanHelp'],
  research_notes: ['research_notes', 'researchNotes', 'research notes', 'notes', 'checks', 'research', 'follow_up', 'followUp', 'follow up'],
  next_step: ['next_step', 'nextStep', 'next step', 'firstStep', 'first_step', 'cta'],
  tags: ['tags', 'tagList', 'tag_list']
};

const ALIAS_TO_FIELD = Object.entries(FIELD_ALIASES).reduce((aliases, [field, names]) => {
  names.forEach((name) => {
    aliases[canonicalKey(name)] = field;
  });
  return aliases;
}, {});

function canonicalKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stripMarkdownCodeFences(content) {
  return String(content || '')
    .replace(/\u0000/g, '')
    .trim()
    .replace(/^```(?:json|javascript|js)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function tryParseObject(value) {
  try {
    const parsed = JSON.parse(value);
    return isPlainObject(parsed) ? parsed : null;
  } catch (error) {
    return null;
  }
}

function extractEmbeddedJsonObject(content) {
  const text = String(content || '');
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }

    if (char === '}' && depth > 0) {
      depth -= 1;

      if (depth === 0 && start >= 0) {
        const parsed = tryParseObject(text.slice(start, index + 1));
        if (parsed) return parsed;
        start = -1;
      }
    }
  }

  return null;
}

function canonicalizeRefinementKeys(rawRefinement) {
  if (!isPlainObject(rawRefinement)) return {};

  return Object.entries(rawRefinement).reduce((refinement, [key, value]) => {
    const mapped = ALIAS_TO_FIELD[canonicalKey(key)] || key;

    if (refinement[mapped] === undefined || refinement[mapped] === null || refinement[mapped] === '') {
      refinement[mapped] = value;
    }

    return refinement;
  }, {});
}

function parseRefinementContent(content) {
  const cleaned = stripMarkdownCodeFences(content);

  if (!cleaned) {
    return {
      rawRefinement: null,
      parseNotes: [],
      fallbackReasons: ['empty_model_response']
    };
  }

  const direct = tryParseObject(cleaned);
  if (direct) {
    return {
      rawRefinement: canonicalizeRefinementKeys(direct),
      parseNotes: ['direct_json'],
      fallbackReasons: []
    };
  }

  const embedded = extractEmbeddedJsonObject(cleaned);
  if (embedded) {
    return {
      rawRefinement: canonicalizeRefinementKeys(embedded),
      parseNotes: ['embedded_json'],
      fallbackReasons: []
    };
  }

  return {
    rawRefinement: null,
    parseNotes: [],
    fallbackReasons: ['malformed_model_content']
  };
}

function normalizeBullets(value, fallback) {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split('\n')
      : [];
  const bullets = source
    .map((item) => sanitizeText(String(item).replace(/^[-*•]\s*/, ''), 130, {
      truncateAt: 'natural'
    }))
    .filter(Boolean)
    .slice(0, 3);

  return [
    ...bullets,
    ...fallback.filter((item) => !bullets.includes(item))
  ].slice(0, 3);
}

function coerceOptionalBoolean(value) {
  if (value === undefined || value === null || value === '') return null;
  if (value === true || value === false) return value;
  if (typeof value === 'number') return value > 0;

  const normalized = sanitizeText(value, 40).toLowerCase();
  if (/^(true|yes|y|valid|game|game signal)$/i.test(normalized)) return true;
  if (/^(false|no|n|invalid|not a game|non-game|off-topic|off topic)$/i.test(normalized)) return false;
  return null;
}

function normalizeTags(value, fallbackTag) {
  const source = Array.isArray(value)
    ? value
    : sanitizeText(value, 120).split(',');

  const tags = source
    .map((item) => sanitizeText(item, 32).toLowerCase().replace(/[^a-z0-9-]+/g, '-'))
    .map((item) => item.replace(/^-|-$/g, ''))
    .filter(Boolean);

  return Array.from(new Set([fallbackTag, ...tags])).slice(0, 5);
}

function fallbackRefinement(submission) {
  const defaultWatchPoints = [
    'Core loop, onboarding, and first-session feel.',
    'Launch timing, alpha access, or event momentum.',
    'Creator, competitive, or community upside.'
  ];

  return {
    title: sanitizeText(`${submission.game_title} Signal`, 120, {
      truncateAt: 'natural',
      terminalPunctuation: false
    }),
    short_summary: sanitizeText(submission.summary, 300, { truncateAt: 'natural' }),
    why_it_matters: sanitizeText(
      `${submission.game_title} may be a useful ${submission.signal_type.replace(/-/g, ' ')} signal for The Alchemists. ${submission.summary}`,
      320,
      { truncateAt: 'natural' }
    ),
    possible_member_interest: sanitizeText(
      'Players, creators, testers, scouts, competitors, and members who like evaluating promising games.',
      220,
      { truncateAt: 'natural' }
    ),
    what_to_watch: normalizeBullets(submission.what_to_watch, defaultWatchPoints),
    creator_angles: [
      'Look for moments that are easy to explain, clip, or stream.',
      'Compare the game signal against current member interests.'
    ],
    research_notes: [
      'Review the main game link and current public information.',
      'Confirm timing, access requirements, and community channels.'
    ],
    next_step: sanitizeText(
      'Join the watchlist and decide whether this signal deserves deeper community review.',
      220,
      { truncateAt: 'natural' }
    ),
    tags: [submission.signal_type]
  };
}

function normalizeRefinement(rawRefinement, submission) {
  const source = canonicalizeRefinementKeys(rawRefinement);
  const fallback = fallbackRefinement(submission);

  return {
    title: sanitizeText(source.title, 120, {
      fallback: fallback.title,
      truncateAt: 'natural',
      terminalPunctuation: false
    }),
    short_summary: sanitizeText(source.short_summary, 360, {
      fallback: fallback.short_summary,
      truncateAt: 'natural'
    }),
    why_it_matters: sanitizeText(source.why_it_matters, 360, {
      fallback: fallback.why_it_matters,
      truncateAt: 'natural'
    }),
    possible_member_interest: sanitizeText(source.possible_member_interest, 260, {
      fallback: fallback.possible_member_interest,
      truncateAt: 'natural'
    }),
    what_to_watch: normalizeBullets(source.what_to_watch, fallback.what_to_watch),
    creator_angles: normalizeBullets(source.creator_angles, fallback.creator_angles),
    research_notes: normalizeBullets(source.research_notes, fallback.research_notes),
    next_step: sanitizeText(source.next_step, 240, {
      fallback: fallback.next_step,
      truncateAt: 'natural'
    }),
    tags: normalizeTags(source.tags, submission.signal_type)
  };
}

async function refineSignalWithAI(submission, options = {}) {
  const content = await callOpenRouter({
    messages: buildRefinementMessages(submission),
    featureLabel: 'Game Signal Engine AI refinement',
    title: 'The Alchemists Game Signal Engine',
    jsonMode: true,
    temperature: 0.25,
    maxTokens: 900,
    onDiagnostic: options.onDiagnostic
  });
  const parsed = parseRefinementContent(content);

  if (!parsed.rawRefinement) {
    throw new ApiError(502, 'Game Signal Engine AI returned an unreadable refinement.', {
      fallback_reasons: parsed.fallbackReasons
    });
  }

  const validGameSignal = coerceOptionalBoolean(parsed.rawRefinement.valid_game_signal);

  if (validGameSignal === false) {
    throw new ApiError(
      400,
      sanitizeText(
        parsed.rawRefinement.validation_reason,
        220,
        { fallback: 'Only game-related submissions can be sent to Game Signal Engine.' }
      ),
      {
        validation: 'non_game_signal'
      }
    );
  }

  return {
    refined: normalizeRefinement(parsed.rawRefinement, submission),
    model: configuredModel(),
    parse_notes: parsed.parseNotes,
    fallback_reasons: parsed.fallbackReasons
  };
}

module.exports = {
  fallbackRefinement,
  normalizeRefinement,
  parseRefinementContent,
  refineSignalWithAI
};
