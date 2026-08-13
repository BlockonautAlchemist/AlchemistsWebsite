const crypto = require('node:crypto');
const { ApiError } = require('../vision-forge/errors');
const { TERMINAL_CATEGORIES, TERMINAL_STRENGTHS } = require('./constants');

const CATEGORY_SET = new Set(TERMINAL_CATEGORIES);
const STRENGTH_SET = new Set(TERMINAL_STRENGTHS);
const ALLOWED_SIGNAL_FIELDS = new Set([
  'externalId',
  'headline',
  'summary',
  'alchemistTake',
  'category',
  'tags',
  'relevantStrengths',
  'sourceName',
  'sourceUrl',
  'originalDate',
  'discoveredAt'
]);

const LIMITS = {
  externalId: 180,
  headline: 180,
  summary: 700,
  alchemistTake: 320,
  sourceName: 140,
  sourceUrl: 2048,
  tag: 40,
  tags: 12,
  strengths: TERMINAL_STRENGTHS.length,
  queryLimitDefault: 25,
  queryLimitMax: 60
};

const TRACKING_PARAMS = [
  /^utm_/i,
  /^pk_/i,
  /^wt\./i,
  /^vero_/i,
  /^oly_/i,
  /^(?:fbclid|gclid|dclid|gbraid|wbraid|mc_cid|mc_eid|igshid|msclkid|yclid)$/i,
  /^(?:ref|ref_src|spm|scid|campaign|source)$/i
];

function assertPlainObject(value, message = 'Payload must be a JSON object.') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(400, message);
  }
}

function rejectUnknownFields(body) {
  const unknown = Object.keys(body).filter((key) => !ALLOWED_SIGNAL_FIELDS.has(key));
  if (unknown.length) {
    throw new ApiError(400, 'Terminal signal payload includes unsupported fields.', {
      fields: unknown
    });
  }
}

function cleanText(value, field, maxLength, { required = true } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new ApiError(400, `${field} is required.`);
    return null;
  }

  if (typeof value !== 'string') {
    throw new ApiError(400, `${field} must be a string.`);
  }

  const text = value
    .replace(/\u0000/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) {
    if (required) throw new ApiError(400, `${field} is required.`);
    return null;
  }

  if (text.length > maxLength) {
    throw new ApiError(400, `${field} must be ${maxLength} characters or fewer.`);
  }

  return text;
}

function validateEnum(value, field, allowed) {
  const text = cleanText(value, field, 80);
  if (!allowed.has(text)) {
    throw new ApiError(400, `${field} is not allowed.`, { value: text });
  }
  return text;
}

function validateEnumArray(value, field, allowed, maxLength) {
  if (!Array.isArray(value)) {
    throw new ApiError(400, `${field} must be an array.`);
  }

  if (!value.length) {
    throw new ApiError(400, `${field} must include at least one value.`);
  }

  if (value.length > maxLength) {
    throw new ApiError(400, `${field} includes too many values.`);
  }

  const seen = new Set();
  return value.map((entry) => {
    const text = validateEnum(entry, field, allowed);
    if (seen.has(text)) {
      throw new ApiError(400, `${field} must not include duplicate values.`, { value: text });
    }
    seen.add(text);
    return text;
  });
}

function validateTags(value) {
  if (value === undefined) return [];

  if (!Array.isArray(value)) {
    throw new ApiError(400, 'tags must be an array.');
  }

  if (value.length > LIMITS.tags) {
    throw new ApiError(400, `tags must include ${LIMITS.tags} values or fewer.`);
  }

  const seen = new Set();
  const tags = [];

  value.forEach((entry) => {
    const text = cleanText(entry, 'tags', LIMITS.tag, { required: false });
    if (!text) return;

    const normalized = text.replace(/^#+/, '').trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) return;

    seen.add(key);
    tags.push(normalized);
  });

  return tags;
}

function validateDateOnly(value, field) {
  const text = cleanText(value, field, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new ApiError(400, `${field} must use YYYY-MM-DD.`);
  }

  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw new ApiError(400, `${field} must be a real calendar date.`);
  }

  return text;
}

function validateDateTime(value, field) {
  const text = cleanText(value, field, 64);
  const timestamp = Date.parse(text);

  if (Number.isNaN(timestamp)) {
    throw new ApiError(400, `${field} must be a valid ISO date/time.`);
  }

  return new Date(timestamp).toISOString();
}

function shouldStripParam(name) {
  return TRACKING_PARAMS.some((pattern) => pattern.test(name));
}

function normalizeSourceUrl(value) {
  const raw = cleanText(value, 'sourceUrl', LIMITS.sourceUrl);
  let url;

  try {
    url = new URL(raw);
  } catch (error) {
    throw new ApiError(400, 'sourceUrl must be a valid URL.');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new ApiError(400, 'sourceUrl must use http or https.');
  }

  if (url.username || url.password) {
    throw new ApiError(400, 'sourceUrl must not include embedded credentials.');
  }

  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  url.hash = '';

  const params = Array.from(url.searchParams.entries())
    .filter(([name]) => !shouldStripParam(name))
    .sort(([nameA, valueA], [nameB, valueB]) => {
      const nameDelta = nameA.localeCompare(nameB);
      return nameDelta || valueA.localeCompare(valueB);
    });

  url.search = '';
  params.forEach(([name, paramValue]) => {
    url.searchParams.append(name, paramValue);
  });

  if (url.pathname.length > 1) {
    url.pathname = url.pathname.replace(/\/+$/g, '');
  }

  return url.toString();
}

function hashSourceUrl(value) {
  return crypto
    .createHash('sha256')
    .update(normalizeSourceUrl(value))
    .digest('hex');
}

function validateTerminalSignalPayload(body) {
  assertPlainObject(body);
  rejectUnknownFields(body);

  const externalId = cleanText(body.externalId, 'externalId', LIMITS.externalId, { required: false });
  const sourceUrl = normalizeSourceUrl(body.sourceUrl);

  return {
    externalId,
    headline: cleanText(body.headline, 'headline', LIMITS.headline),
    summary: cleanText(body.summary, 'summary', LIMITS.summary),
    alchemistTake: cleanText(body.alchemistTake, 'alchemistTake', LIMITS.alchemistTake),
    category: validateEnum(body.category, 'category', CATEGORY_SET),
    tags: validateTags(body.tags),
    relevantStrengths: validateEnumArray(
      body.relevantStrengths,
      'relevantStrengths',
      STRENGTH_SET,
      LIMITS.strengths
    ),
    sourceName: cleanText(body.sourceName, 'sourceName', LIMITS.sourceName),
    sourceUrl,
    sourceUrlHash: hashSourceUrl(sourceUrl),
    originalDate: validateDateOnly(body.originalDate, 'originalDate'),
    discoveredAt: validateDateTime(body.discoveredAt, 'discoveredAt')
  };
}

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function validateListQuery(query = {}) {
  const category = firstQueryValue(query.category);
  const limitValue = firstQueryValue(query.limit);
  let limit = LIMITS.queryLimitDefault;

  if (limitValue !== undefined && limitValue !== '') {
    if (!/^\d+$/.test(String(limitValue))) {
      throw new ApiError(400, 'limit must be a whole number.');
    }

    limit = Number(limitValue);
    if (limit < 1 || limit > LIMITS.queryLimitMax) {
      throw new ApiError(400, `limit must be between 1 and ${LIMITS.queryLimitMax}.`);
    }
  }

  if (category !== undefined && category !== '') {
    const text = String(category).trim();
    if (!CATEGORY_SET.has(text)) {
      throw new ApiError(400, 'category is not allowed.', { value: text });
    }

    return { category: text, limit };
  }

  return { category: null, limit };
}

module.exports = {
  LIMITS,
  TERMINAL_CATEGORIES,
  TERMINAL_STRENGTHS,
  hashSourceUrl,
  normalizeSourceUrl,
  validateListQuery,
  validateTerminalSignalPayload
};
