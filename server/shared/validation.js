const TRAILING_WORDS = [
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'but',
  'by',
  'for',
  'from',
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
  'where',
  'which',
  'while',
  'who',
  'with'
].join('|');
const TRAILING_WORDS_RE = new RegExp(`\\s+\\b(?:${TRAILING_WORDS})\\b\\.?$`, 'i');

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

function stripDanglingEnding(text) {
  let cleaned = String(text || '')
    .replace(/[\s,:;]+$/g, '')
    .trim();
  let previous = '';

  while (cleaned && cleaned !== previous) {
    previous = cleaned;
    cleaned = cleaned
      .replace(TRAILING_WORDS_RE, '')
      .replace(/[\s,:;]+$/g, '')
      .trim();
  }

  return cleaned;
}

function truncateAtNaturalBoundary(text, maxLength, options = {}) {
  if (text.length <= maxLength) return text;

  const clipped = text.slice(0, maxLength).trim();
  const minBoundaryLength = Math.min(clipped.length - 1, Math.max(24, Math.floor(maxLength * 0.35)));
  const sentenceMatcher = /[.!?](?:[)"'\]]+)?(?=\s|$)/g;
  let match = sentenceMatcher.exec(clipped);
  let best = -1;

  while (match) {
    const end = match.index + match[0].length;
    if (end >= minBoundaryLength) best = end;
    match = sentenceMatcher.exec(clipped);
  }

  const trimmed = best > -1
    ? clipped.slice(0, best).trim()
    : stripDanglingEnding(clipped.slice(0, clipped.lastIndexOf(' ')));

  if (!trimmed) return stripDanglingEnding(clipped);
  if (options.terminalPunctuation === false || /[.!?][)"'\]]*$/.test(trimmed)) return trimmed;

  return `${stripDanglingEnding(trimmed).slice(0, Math.max(0, maxLength - 1))}.`;
}

function sanitizeText(value, maxLength = 500, options = {}) {
  const fallback = options.fallback || '';

  if (value === null || value === undefined) return fallback;

  const text = cleanWhitespace(
    String(value)
      .replace(/\u0000/g, '')
      .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' '),
    Boolean(options.preserveNewlines)
  );

  if (!text) return fallback;

  if (options.truncateAt === 'natural') {
    return truncateAtNaturalBoundary(text, maxLength, options);
  }

  return text.slice(0, maxLength).trim();
}

function sanitizeDiscordName(value, maxLength = 80) {
  return sanitizeText(value, maxLength)
    .replace(/[@#:`*~|>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeSlug(value, maxLength = 96) {
  return sanitizeText(value, maxLength)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

function sanitizeUrl(value, maxLength = 500) {
  const raw = sanitizeText(value, maxLength);

  if (!raw) return '';

  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.hash = '';
    return url.toString();
  } catch (error) {
    return '';
  }
}

module.exports = {
  sanitizeDiscordName,
  sanitizeSlug,
  sanitizeText,
  sanitizeUrl,
  truncateAtNaturalBoundary
};
