const { ApiError } = require('./errors');

const LIMITS = {
  username: 80,
  message: 1600,
  assistantMessage: 2600,
  previewField: 360,
  previewLongField: 620,
  hook: 300,
  bullet: 180,
  title: 120,
  tweak: 160
};

// Keep the conversation bounded: at most this many turns reach the model.
const MAX_MESSAGES = 16;
// Hard ceiling on the combined conversation size sent to the model.
const MAX_CONVERSATION_CHARS = 12000;
const TRAILING_WORDS = [
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'been',
  'being',
  'but',
  'by',
  'because',
  'for',
  'from',
  'if',
  'in',
  'is',
  'of',
  'on',
  'or',
  'our',
  'so',
  'that',
  'the',
  'their',
  'to',
  'was',
  'were',
  'when',
  'where',
  'which',
  'while',
  'who',
  'with',
  'without'
].join('|');
const TRAILING_WORDS_RE = new RegExp(`\\s+\\b(?:${TRAILING_WORDS})\\b\\.?$`, 'i');

function hasTerminalPunctuation(text) {
  return /[.!?][)"'\]]*$/.test(text);
}

function stripUnclosedPair(text, open, close) {
  const openIndex = text.lastIndexOf(open);
  const closeIndex = text.lastIndexOf(close);

  if (openIndex > closeIndex) {
    return text.slice(0, openIndex).trim();
  }

  return text;
}

function stripDanglingEnding(text) {
  let cleaned = String(text || '')
    .replace(/[\s,:;]+$/g, '')
    .trim();
  let previous = '';

  cleaned = stripUnclosedPair(cleaned, '(', ')');
  cleaned = stripUnclosedPair(cleaned, '[', ']');

  while (cleaned && cleaned !== previous) {
    previous = cleaned;
    cleaned = cleaned
      .replace(TRAILING_WORDS_RE, '')
      .replace(/[\s,:;]+$/g, '')
      .trim();
    cleaned = stripUnclosedPair(cleaned, '(', ')');
    cleaned = stripUnclosedPair(cleaned, '[', ']');
  }

  return cleaned;
}

function lastSentenceBoundary(text, minLength) {
  const matcher = /[.!?](?:[)"'\]]+)?(?=\s|$)/g;
  let match = matcher.exec(text);
  let best = -1;

  while (match) {
    const end = match.index + match[0].length;
    if (end >= minLength) best = end;
    match = matcher.exec(text);
  }

  return best;
}

function lastClauseBoundary(text, minLength) {
  const matcher = /[,;:](?=\s|$)/g;
  let match = matcher.exec(text);
  let best = -1;

  while (match) {
    const end = match.index;
    if (end >= minLength) best = end;
    match = matcher.exec(text);
  }

  return best;
}

function lastConnectorBoundary(text, minLength) {
  const matcher = /\s(?:and|or|but|so|with|without|for|to|from|because|while|where|which|that|who|as)\s/gi;
  let match = matcher.exec(text);
  let best = -1;

  while (match) {
    if (match.index >= minLength) best = match.index;
    match = matcher.exec(text);
  }

  return best;
}

function lastWordBoundary(text, minLength) {
  const index = text.lastIndexOf(' ');
  return index >= minLength ? index : -1;
}

function finishNaturalTrim(text, maxLength, terminalPunctuation) {
  const source = String(text || '').trim();

  if (!source) return '';

  if (hasTerminalPunctuation(source) && source.length <= maxLength) {
    return source;
  }

  let cleaned = stripDanglingEnding(source);

  if (!cleaned) return '';

  if (terminalPunctuation && !hasTerminalPunctuation(cleaned)) {
    if (cleaned.length + 1 > maxLength) {
      cleaned = stripDanglingEnding(cleaned.slice(0, Math.max(0, maxLength - 1)));
    }

    if (cleaned && !hasTerminalPunctuation(cleaned)) {
      cleaned = `${cleaned}.`;
    }
  }

  if (cleaned.length <= maxLength) return cleaned;

  return stripDanglingEnding(cleaned.slice(0, maxLength));
}

function truncateAtNaturalBoundary(text, maxLength, options = {}) {
  if (text.length <= maxLength) return text;

  const clipped = text.slice(0, maxLength).trim();
  const minBoundaryLength = Math.min(
    clipped.length - 1,
    Math.max(24, Math.floor(maxLength * (options.minBoundaryRatio || 0.28)))
  );
  const terminalPunctuation = options.terminalPunctuation !== false;
  const sentenceEnd = lastSentenceBoundary(clipped, minBoundaryLength);

  if (sentenceEnd > -1) {
    return finishNaturalTrim(clipped.slice(0, sentenceEnd), maxLength, terminalPunctuation);
  }

  const clauseEnd = lastClauseBoundary(clipped, minBoundaryLength);

  if (clauseEnd > -1) {
    return finishNaturalTrim(clipped.slice(0, clauseEnd), maxLength, terminalPunctuation);
  }

  const connectorEnd = lastConnectorBoundary(clipped, minBoundaryLength);

  if (connectorEnd > -1) {
    return finishNaturalTrim(clipped.slice(0, connectorEnd), maxLength, terminalPunctuation);
  }

  const wordEnd = lastWordBoundary(clipped, minBoundaryLength);

  if (wordEnd > -1) {
    return finishNaturalTrim(clipped.slice(0, wordEnd), maxLength, terminalPunctuation);
  }

  return finishNaturalTrim(clipped, maxLength, terminalPunctuation);
}

const REQUIRED_PREVIEW_FIELDS = [
  'title',
  'submitted_by',
  'hook',
  'vision',
  'why_it_matters',
  'how_it_could_work',
  'why_it_fits_the_alchemists',
  'first_step',
  'relevance_status'
];

function cleanWhitespace(text, preserveNewlines) {
  if (preserveNewlines) {
    return text
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((line) => line.replace(/[ \t]+/g, ' ').trim())
      .filter(Boolean)
      .join('\n');
  }

  return text.replace(/\s+/g, ' ').trim();
}

function sanitizeText(value, maxLength = 500, options = {}) {
  const preserveNewlines = Boolean(options.preserveNewlines);
  const fallback = options.fallback || '';

  if (value === null || value === undefined) return fallback;

  const text = cleanWhitespace(
    String(value)
      .replace(/\u0000/g, '')
      .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' '),
    preserveNewlines
  );

  if (!text) return fallback;

  if (options.truncateAt === 'natural') {
    return truncateAtNaturalBoundary(text, maxLength, options);
  }

  return text.slice(0, maxLength).trim();
}

function sanitizeDiscordName(value) {
  return sanitizeText(value, LIMITS.username)
    .replace(/[@#:`*~|>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function validateHoneypot(body) {
  const trap = sanitizeText(
    body.honeypot || body.website || body.company || body.forge_signal || '',
    120
  );

  if (trap) {
    throw new ApiError(400, 'Vision Forge could not accept this request.');
  }
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];

  const cleaned = messages
    .map((item) => {
      const role = item && item.role === 'assistant' ? 'assistant' : 'user';
      const isAssistant = role === 'assistant';
      const content = sanitizeText(
        item && item.content,
        isAssistant ? LIMITS.assistantMessage : LIMITS.message,
        {
          preserveNewlines: true,
          truncateAt: isAssistant ? 'natural' : undefined
        }
      );

      return content ? { role, content } : null;
    })
    .filter(Boolean)
    .slice(-MAX_MESSAGES);

  // Trim oldest turns until the combined size is within bounds.
  let total = cleaned.reduce((sum, item) => sum + item.content.length, 0);
  while (cleaned.length > 1 && total > MAX_CONVERSATION_CHARS) {
    total -= cleaned.shift().content.length;
  }

  return cleaned;
}

function validateChatPayload(body, options = {}) {
  validateHoneypot(body);

  const username = sanitizeDiscordName(body.discord_username || body.username);
  const messages = normalizeMessages(body.messages);

  if (username.length < 2) {
    throw new ApiError(400, 'Add your Discord username before using Vision Forge.');
  }

  if (!messages.length) {
    throw new ApiError(400, 'Share an idea so Vision Forge has something to work with.');
  }

  if (options.requireConversation && messages[messages.length - 1].role !== 'user') {
    throw new ApiError(400, 'The latest message must come from you.');
  }

  return {
    username,
    messages
  };
}

function clampScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(5, Math.max(1, Math.round(numeric)));
}

function normalizeStatus(value) {
  const status = sanitizeText(value, 40);

  if (/strong/i.test(status)) return 'Strong Fit';
  if (/refine|needs/i.test(status)) return 'Needs Refinement';
  return 'Off Track';
}

function normalizeTweaks(value) {
  const source = Array.isArray(value) ? value : [];

  return source
    .map((item) => sanitizeText(item, LIMITS.tweak))
    .filter(Boolean)
    .slice(0, 3);
}

function normalizeHowItCouldWork(value) {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split('\n')
      : [];

  return source
    .map((item) => sanitizeText(String(item).replace(/^[-*•]\s*/, ''), LIMITS.bullet, {
      truncateAt: 'natural'
    }))
    .filter(Boolean)
    .slice(0, 3);
}

function normalizePreview(raw, username) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const preview = {
    title: sanitizeText(source.title, LIMITS.title, {
      truncateAt: 'natural',
      terminalPunctuation: false
    }),
    submitted_by: sanitizeDiscordName(source.submitted_by) || sanitizeDiscordName(username),
    hook: sanitizeText(source.hook, LIMITS.hook, { truncateAt: 'natural' }),
    vision: sanitizeText(source.vision, LIMITS.previewLongField, { truncateAt: 'natural' }),
    why_it_matters: sanitizeText(source.why_it_matters, LIMITS.previewLongField, { truncateAt: 'natural' }),
    how_it_could_work: normalizeHowItCouldWork(source.how_it_could_work),
    why_it_fits_the_alchemists: sanitizeText(source.why_it_fits_the_alchemists, LIMITS.previewLongField, {
      truncateAt: 'natural'
    }),
    first_step: sanitizeText(source.first_step, LIMITS.previewLongField, { truncateAt: 'natural' }),
    alignment_score: clampScore(source.alignment_score),
    relevance_status: normalizeStatus(source.relevance_status),
    suggested_tweaks: normalizeTweaks(source.suggested_tweaks)
  };

  return preview;
}

function hasRequiredPreviewFields(preview) {
  return REQUIRED_PREVIEW_FIELDS.every((field) => {
    if (field === 'how_it_could_work') {
      return Array.isArray(preview.how_it_could_work)
        && preview.how_it_could_work.length === 3
        && preview.how_it_could_work.every((item) => Boolean(sanitizeText(item, LIMITS.previewField)));
    }

    return Boolean(sanitizeText(preview[field], LIMITS.previewField));
  });
}

module.exports = {
  LIMITS,
  REQUIRED_PREVIEW_FIELDS,
  hasRequiredPreviewFields,
  normalizePreview,
  normalizeHowItCouldWork,
  sanitizeText,
  sanitizeDiscordName,
  validateChatPayload
};
