const { ApiError } = require('../vision-forge/errors');
const {
  COMMAND_CENTER_HISTORY_LIMIT_DEFAULT,
  COMMAND_CENTER_HISTORY_LIMIT_MAX,
  COMMAND_CENTER_STATES,
  DEFAULT_COMMAND_CENTER_AGENT,
  DEFAULT_COMMAND_CENTER_TTL_SECONDS
} = require('./constants');

const STATE_SET = new Set(COMMAND_CENTER_STATES);
const ALLOWED_TELEMETRY_FIELDS = new Set([
  'eventId',
  'agent',
  'workflow',
  'workflowLabel',
  'state',
  'activity',
  'timestamp',
  'startedAt',
  'ttlSeconds',
  'publicUrl',
  'context'
]);
const ALLOWED_CONTEXT_FIELDS = new Set(['station', 'target', 'count']);

const LIMITS = {
  eventId: 180,
  agent: 80,
  workflow: 80,
  workflowLabel: 96,
  state: 40,
  activity: 220,
  publicUrl: 2048,
  contextStation: 80,
  contextTarget: 140,
  queryLimitMax: COMMAND_CENTER_HISTORY_LIMIT_MAX
};

const MAX_EVENT_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_STARTED_AT_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const MIN_TTL_SECONDS = 30;
const MAX_TTL_SECONDS = 60 * 60;

function assertPlainObject(value, message = 'Payload must be a JSON object.') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(400, message);
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

function rejectUnknownFields(body) {
  const unknown = Object.keys(body).filter((key) => !ALLOWED_TELEMETRY_FIELDS.has(key));
  if (unknown.length) {
    throw new ApiError(400, 'Command Center telemetry includes unsupported fields.', {
      fields: unknown
    });
  }
}

function labelizeWorkflow(workflow) {
  return workflow
    .split(/[-_.]+/g)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function validateTokenLike(value, field, maxLength, { required = true, defaultValue = null } = {}) {
  const text = cleanText(value === undefined ? defaultValue : value, field, maxLength, { required });
  if (!text) return null;

  if (!/^[a-z0-9][a-z0-9._:-]*$/i.test(text)) {
    throw new ApiError(400, `${field} may only contain letters, numbers, dots, underscores, colons, and hyphens.`);
  }

  return text.toLowerCase();
}

function validateEventId(value) {
  if (value === undefined || value === null) return null;

  const text = cleanText(value, 'eventId', LIMITS.eventId, { required: false });
  if (!text) return null;

  if (!/^[a-z0-9][a-z0-9._:-]*$/i.test(text)) {
    throw new ApiError(400, 'eventId may only contain letters, numbers, dots, underscores, colons, and hyphens.');
  }

  return text;
}

function validateState(value) {
  const state = cleanText(value, 'state', LIMITS.state).toLowerCase();
  if (!STATE_SET.has(state)) {
    throw new ApiError(400, 'state is not allowed.', { value: state });
  }

  return state;
}

function validateDateTime(value, field, {
  required = false,
  now = Date.now(),
  maxPastMs = MAX_EVENT_AGE_MS
} = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ApiError(400, `${field} is required.`);
    return null;
  }

  const text = cleanText(value, field, 64);
  const timestamp = Date.parse(text);

  if (Number.isNaN(timestamp)) {
    throw new ApiError(400, `${field} must be a valid ISO date/time.`);
  }

  if (timestamp > now + MAX_FUTURE_SKEW_MS) {
    throw new ApiError(400, `${field} is too far in the future.`);
  }

  if (timestamp < now - maxPastMs) {
    throw new ApiError(400, `${field} is too old.`);
  }

  return new Date(timestamp).toISOString();
}

function validateTtlSeconds(value) {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_COMMAND_CENTER_TTL_SECONDS;
  }

  if (!Number.isInteger(value)) {
    throw new ApiError(400, 'ttlSeconds must be a whole number.');
  }

  if (value < MIN_TTL_SECONDS || value > MAX_TTL_SECONDS) {
    throw new ApiError(400, `ttlSeconds must be between ${MIN_TTL_SECONDS} and ${MAX_TTL_SECONDS}.`);
  }

  return value;
}

function validatePublicUrl(value) {
  const raw = cleanText(value, 'publicUrl', LIMITS.publicUrl, { required: false });
  if (!raw) return null;

  let url;

  try {
    url = new URL(raw);
  } catch (error) {
    throw new ApiError(400, 'publicUrl must be a valid URL.');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new ApiError(400, 'publicUrl must use http or https.');
  }

  if (url.username || url.password) {
    throw new ApiError(400, 'publicUrl must not include embedded credentials.');
  }

  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();

  return url.toString();
}

function validateContext(value) {
  if (value === undefined || value === null) return {};
  assertPlainObject(value, 'context must be a JSON object.');

  const unknown = Object.keys(value).filter((key) => !ALLOWED_CONTEXT_FIELDS.has(key));
  if (unknown.length) {
    throw new ApiError(400, 'context includes unsupported fields.', {
      fields: unknown
    });
  }

  const context = {};
  const station = cleanText(value.station, 'context.station', LIMITS.contextStation, { required: false });
  const target = cleanText(value.target, 'context.target', LIMITS.contextTarget, { required: false });

  if (station) context.station = station.toLowerCase();
  if (target) context.target = target;

  if (value.count !== undefined && value.count !== null) {
    if (!Number.isInteger(value.count) || value.count < 0 || value.count > 100000) {
      throw new ApiError(400, 'context.count must be a whole number between 0 and 100000.');
    }

    context.count = value.count;
  }

  return context;
}

function validateTelemetryPayload(body, { now = Date.now() } = {}) {
  assertPlainObject(body);
  rejectUnknownFields(body);

  const agent = validateTokenLike(body.agent, 'agent', LIMITS.agent, {
    defaultValue: DEFAULT_COMMAND_CENTER_AGENT
  });
  const workflow = validateTokenLike(body.workflow, 'workflow', LIMITS.workflow);
  const workflowLabel = cleanText(body.workflowLabel, 'workflowLabel', LIMITS.workflowLabel, {
    required: false
  }) || labelizeWorkflow(workflow);
  const state = validateState(body.state);
  const timestamp = validateDateTime(body.timestamp, 'timestamp', {
    now,
    required: false,
    maxPastMs: MAX_EVENT_AGE_MS
  }) || new Date(now).toISOString();
  const startedAt = validateDateTime(body.startedAt, 'startedAt', {
    now,
    required: false,
    maxPastMs: MAX_STARTED_AT_AGE_MS
  });
  const ttlSeconds = validateTtlSeconds(body.ttlSeconds);
  const expiresAt = new Date(Date.parse(timestamp) + ttlSeconds * 1000).toISOString();

  return {
    eventId: validateEventId(body.eventId),
    agent,
    workflow,
    workflowLabel,
    state,
    activity: cleanText(body.activity, 'activity', LIMITS.activity),
    timestamp,
    startedAt,
    ttlSeconds,
    expiresAt,
    publicUrl: validatePublicUrl(body.publicUrl),
    context: validateContext(body.context)
  };
}

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function validateStateQuery(query = {}) {
  const limitValue = firstQueryValue(query.historyLimit || query.limit);
  let historyLimit = COMMAND_CENTER_HISTORY_LIMIT_DEFAULT;

  if (limitValue !== undefined && limitValue !== '') {
    if (!/^\d+$/.test(String(limitValue))) {
      throw new ApiError(400, 'historyLimit must be a whole number.');
    }

    historyLimit = Number(limitValue);
    if (historyLimit < 0 || historyLimit > COMMAND_CENTER_HISTORY_LIMIT_MAX) {
      throw new ApiError(400, `historyLimit must be between 0 and ${COMMAND_CENTER_HISTORY_LIMIT_MAX}.`);
    }
  }

  return { historyLimit };
}

module.exports = {
  ALLOWED_CONTEXT_FIELDS,
  ALLOWED_TELEMETRY_FIELDS,
  LIMITS,
  cleanText,
  labelizeWorkflow,
  validateStateQuery,
  validateTelemetryPayload
};
