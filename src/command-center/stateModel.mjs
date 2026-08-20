import { COMMAND_CENTER_FALLBACK_STATION_ID, stationIdForWorkflow } from './sceneConfig.mjs';

export const COMMAND_CENTER_STATES = Object.freeze([
  'idle',
  'researching',
  'browsing',
  'scanning',
  'evaluating',
  'thinking',
  'writing',
  'coding',
  'processing',
  'executing',
  'publishing',
  'posting_to_x',
  'newsletter',
  'terminal_publish',
  'waiting',
  'complete',
  'warning',
  'error'
]);

export const COMMAND_CENTER_ACTIVE_STATES = Object.freeze([
  'researching',
  'browsing',
  'scanning',
  'evaluating',
  'thinking',
  'writing',
  'coding',
  'processing',
  'executing',
  'publishing',
  'posting_to_x',
  'newsletter',
  'terminal_publish',
  'waiting'
]);

const STATE_SET = new Set(COMMAND_CENTER_STATES);
const ACTIVE_STATE_SET = new Set(COMMAND_CENTER_ACTIVE_STATES);
const ATTENTION_STATE_SET = new Set(['warning', 'error']);

function cleanText(value, maxLength = 220) {
  if (value === undefined || value === null) return '';

  return String(value)
    .replace(/\u0000/g, '')
    .replace(/[\u0001-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .trim();
}

function cleanToken(value, fallback = '') {
  const text = cleanText(value, 96).toLowerCase();
  return /^[a-z0-9][a-z0-9._:-]*$/i.test(text) ? text : fallback;
}

function isoDate(value) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? '' : new Date(timestamp).toISOString();
}

function timestampMs(value) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function normalizeContext(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const context = {};
  const station = cleanToken(value.station);
  const target = cleanText(value.target, 140);
  const count = Number(value.count);

  if (station) context.station = station;
  if (target) context.target = target;
  if (Number.isInteger(count) && count >= 0 && count <= 100000) context.count = count;

  return context;
}

function normalizeUrl(value) {
  const text = cleanText(value, 2048);
  if (!text) return null;

  try {
    const url = new URL(text);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch (error) {
    return null;
  }
}

function normalizeState(value) {
  const state = cleanText(value, 40).toLowerCase();
  return STATE_SET.has(state) ? state : 'warning';
}

function computedExpiresAt(timestamp, ttlSeconds) {
  const timestampValue = timestampMs(timestamp);
  if (!timestampValue || !ttlSeconds) return '';

  return new Date(timestampValue + ttlSeconds * 1000).toISOString();
}

function normalizeWorkflow(entry = {}, now = Date.now(), { history = false } = {}) {
  const state = normalizeState(entry.state);
  const timestamp = isoDate(entry.timestamp || entry.eventTimestamp || entry.updatedAt || entry.receivedAt);
  const ttlSeconds = Number.isInteger(entry.ttlSeconds) ? entry.ttlSeconds : 0;
  const expiresAt = isoDate(entry.expiresAt) || computedExpiresAt(timestamp, ttlSeconds);
  const expired = Boolean(expiresAt && timestampMs(expiresAt) <= now);
  const displayState = expired && !history ? 'idle' : state;
  const context = normalizeContext(entry.context);
  const workflow = {
    id: cleanText(entry.id, 96) || null,
    eventId: cleanText(entry.eventId, 180) || null,
    agent: cleanToken(entry.agent, 'spawncamper9000'),
    workflow: cleanToken(entry.workflow, 'unknown'),
    workflowLabel: cleanText(entry.workflowLabel, 96) || cleanText(entry.workflow, 80) || 'Unknown',
    state,
    displayState,
    activity: cleanText(entry.activity, 220) || 'Awaiting heartbeat',
    timestamp,
    startedAt: isoDate(entry.startedAt),
    ttlSeconds,
    expiresAt,
    publicUrl: normalizeUrl(entry.publicUrl),
    context,
    updatedAt: isoDate(entry.updatedAt || entry.receivedAt),
    receivedAt: isoDate(entry.receivedAt),
    isStale: expired || Boolean(entry.isStale),
    isActive: ACTIVE_STATE_SET.has(displayState),
    isAttention: ATTENTION_STATE_SET.has(displayState),
    isComplete: displayState === 'complete',
    isVisible: displayState !== 'idle',
    sortTime: timestampMs(timestamp) || timestampMs(entry.updatedAt) || timestampMs(entry.receivedAt)
  };

  workflow.stationId = stationIdForWorkflow(workflow) || COMMAND_CENTER_FALLBACK_STATION_ID;
  return workflow;
}

function compareWorkflow(a, b) {
  const activeDelta = Number(b.isVisible) - Number(a.isVisible);
  if (activeDelta) return activeDelta;

  const timeDelta = b.sortTime - a.sortTime;
  if (timeDelta) return timeDelta;

  return a.workflowLabel.localeCompare(b.workflowLabel);
}

export function deriveOverallStatus(workflows) {
  if (workflows.some((workflow) => workflow.displayState === 'error')) return 'error';
  if (workflows.some((workflow) => workflow.displayState === 'warning')) return 'warning';
  if (workflows.some((workflow) => workflow.isActive)) return 'active';
  if (workflows.some((workflow) => workflow.displayState === 'complete')) return 'complete';
  if (workflows.some((workflow) => workflow.isStale)) return 'stale';
  return 'idle';
}

export function normalizePublicState(payload = {}, now = Date.now()) {
  const rawWorkflows = Array.isArray(payload.workflows) ? payload.workflows : [];
  const rawHistory = Array.isArray(payload.recentHistory) ? payload.recentHistory : [];
  const workflows = rawWorkflows
    .map((workflow) => normalizeWorkflow(workflow, now))
    .sort(compareWorkflow);
  const recentHistory = rawHistory
    .map((event) => normalizeWorkflow(event, now, { history: true }))
    .sort((a, b) => b.sortTime - a.sortTime);
  const activeWorkflows = workflows.filter((workflow) => workflow.isActive);
  const visibleWorkflows = workflows.filter((workflow) => workflow.isVisible);
  const primaryWorkflow = activeWorkflows[0] || visibleWorkflows[0] || null;

  return {
    success: payload.success === true,
    fetchedAt: isoDate(payload.fetchedAt) || new Date(now).toISOString(),
    workflows,
    activeWorkflows,
    visibleWorkflows,
    recentHistory,
    primaryWorkflow,
    staleCount: workflows.filter((workflow) => workflow.isStale).length,
    overallStatus: deriveOverallStatus(workflows)
  };
}

export function fallbackCommandCenterState({ message = 'Telemetry unavailable', now = Date.now() } = {}) {
  return {
    success: false,
    fetchedAt: new Date(now).toISOString(),
    workflows: [],
    activeWorkflows: [],
    visibleWorkflows: [],
    recentHistory: [],
    primaryWorkflow: null,
    staleCount: 0,
    overallStatus: 'offline',
    message: cleanText(message, 180)
  };
}
