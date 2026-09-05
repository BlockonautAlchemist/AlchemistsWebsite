import {
  COMMAND_CENTER_AREAS,
  COMMAND_CENTER_COMPLETE_ACK_MS,
  COMMAND_CENTER_FALLBACK_AREA_ID,
  areaIdForWorkflow, canonicalAreaId
} from './sceneConfig.mjs';
import {
  machineDisplay,
  machineForWorkflow
} from './machineConfig.mjs';

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

export const COMMAND_CENTER_TRANSMISSION_STATES = Object.freeze([
  'terminal_publish',
  'posting_to_x',
  'newsletter',
  'publishing'
]);

const STATE_SET = new Set(COMMAND_CENTER_STATES);
const ACTIVE_STATE_SET = new Set(COMMAND_CENTER_ACTIVE_STATES);
const ATTENTION_STATE_SET = new Set(['warning', 'error']);
const TRANSMISSION_STATE_SET = new Set(COMMAND_CENTER_TRANSMISSION_STATES);

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
  return STATE_SET.has(state) ? state : 'idle';
}

function computedExpiresAt(timestamp, ttlSeconds) {
  const timestampValue = timestampMs(timestamp);
  if (!timestampValue || !ttlSeconds) return '';

  return new Date(timestampValue + ttlSeconds * 1000).toISOString();
}

function isFreshComplete(state, sortTime, now) {
  if (state !== 'complete' || !sortTime) return false;
  const age = now - sortTime;
  return age >= 0 && age <= COMMAND_CENTER_COMPLETE_ACK_MS;
}

function displayStateFor({ state, stale, history, sortTime, now }) {
  if (history) return state;
  if (stale) return 'idle';
  if (state === 'complete' && !isFreshComplete(state, sortTime, now)) return 'idle';
  return state;
}

function normalizeWorkflow(entry = {}, now = Date.now(), { history = false } = {}) {
  const state = normalizeState(entry.state);
  const timestamp = isoDate(entry.timestamp || entry.eventTimestamp || entry.updatedAt || entry.receivedAt);
  const ttlSeconds = Number.isInteger(entry.ttlSeconds) && entry.ttlSeconds > 0 && entry.ttlSeconds <= 3600 ? entry.ttlSeconds : 900;
  const expiresAt = isoDate(entry.expiresAt) || computedExpiresAt(timestamp, ttlSeconds);
  const expired = Boolean(expiresAt && timestampMs(expiresAt) <= now);
  const sortTime = timestampMs(timestamp) || timestampMs(entry.updatedAt) || timestampMs(entry.receivedAt);
  const stale = expired || Boolean(entry.isStale);
  const displayState = displayStateFor({ state, stale, history, sortTime, now });
  const context = normalizeContext(entry.context);
  const lastActivity = entry.lastActivity;
  if (!canonicalAreaId(context.station) && ['waiting', 'complete', 'warning', 'error'].includes(displayState)
      && lastActivity && (!entry.startedAt || timestampMs(lastActivity.timestamp) >= timestampMs(entry.startedAt))) {
    context.station = areaIdForWorkflow(lastActivity);
  }
  const displayMachine = machineDisplay(machineForWorkflow(entry.workflow));
  // `displayState`, not `state`: a stale or long-finished entry reads as idle, and
  // an idle entry names no activity, so it resolves back to its own machine rather
  // than pinning him to a workstation whose work ended hours ago.
  const areaId = areaIdForWorkflow({
    workflow: entry.workflow,
    state: displayState,
    context
  }) || COMMAND_CENTER_FALLBACK_AREA_ID;
  const completeAcknowledged = displayState === 'complete';
  const workflow = {
    id: cleanText(entry.id, 96) || null,
    eventId: cleanText(entry.eventId, 180) || null,
    eventOrder: cleanText(entry.eventOrder || entry.id, 180),
    lastActivity: lastActivity ? { workflow: cleanToken(lastActivity.workflow), state: normalizeState(lastActivity.state),
      timestamp: isoDate(lastActivity.timestamp), context: normalizeContext(lastActivity.context) } : null,
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
    isStale: stale,
    isActive: ACTIVE_STATE_SET.has(displayState),
    isAttention: ATTENTION_STATE_SET.has(displayState),
    isComplete: state === 'complete',
    isCompleteAcknowledgement: completeAcknowledged,
    isTransmission: TRANSMISSION_STATE_SET.has(displayState),
    isVisible: displayState !== 'idle',
    sortTime,
    areaId,
    stationId: areaId,
    machineId: displayMachine?.id || null,
    machineName: displayMachine?.name || '',
    machineShortName: displayMachine?.shortName || '',
    machineDescription: displayMachine?.description || '',
    machineVisualDescription: displayMachine?.visualDescription || '',
    displayMachine
  };

  return workflow;
}

const eventOrder = (entry) => String(entry.eventOrder || entry.eventId || entry.id || '');
const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function compareEvents(a, b) {
  return timestampMs(a.timestamp) - timestampMs(b.timestamp) || compareText(eventOrder(a), eventOrder(b));
}

function compareLatest(a, b) {
  const timeDelta = b.sortTime - a.sortTime;
  if (timeDelta) return timeDelta;

  const workflowDelta = a.workflowLabel.localeCompare(b.workflowLabel);
  if (workflowDelta) return workflowDelta;

  return compareText(eventOrder(b), eventOrder(a)) || compareText(a.agent, b.agent);
}

function compareWorkflow(a, b) {
  const visibleDelta = Number(b.isVisible) - Number(a.isVisible);
  if (visibleDelta) return visibleDelta;

  const timeDelta = b.sortTime - a.sortTime;
  if (timeDelta) return timeDelta;

  return a.workflowLabel.localeCompare(b.workflowLabel);
}

function latestMatching(workflows, predicate) {
  return workflows
    .filter(predicate)
    .sort(compareLatest)[0] || null;
}

export function selectFocusWorkflow(workflows) {
  return latestMatching(workflows, (workflow) => workflow.displayState === 'error' || workflow.displayState === 'warning')
    || latestMatching(workflows, (workflow) => TRANSMISSION_STATE_SET.has(workflow.displayState))
    || latestMatching(workflows, (workflow) => workflow.isActive)
    || latestMatching(workflows, (workflow) => workflow.isCompleteAcknowledgement)
    || null;
}

export function groupWorkflowsByArea(workflows) {
  return COMMAND_CENTER_AREAS.map((area) => {
    const areaWorkflows = workflows.filter((workflow) => workflow.areaId === area.id);
    const visibleWorkflows = areaWorkflows.filter((workflow) => workflow.isVisible);
    const activeWorkflows = areaWorkflows.filter((workflow) => workflow.isActive);
    const staleWorkflows = areaWorkflows.filter((workflow) => workflow.isStale);
    const displayWorkflow = selectFocusWorkflow(areaWorkflows);

    return {
      id: area.id,
      label: area.label,
      shortLabel: area.shortLabel,
      workflows: areaWorkflows,
      visibleWorkflows,
      activeWorkflows,
      staleWorkflows,
      displayWorkflow,
      displayMachine: displayWorkflow?.displayMachine || null,
      displayState: displayWorkflow ? displayWorkflow.displayState : 'idle',
      isActiveArea: Boolean(displayWorkflow)
    };
  });
}

export function deriveOverallStatus(workflows) {
  if (workflows.some((workflow) => workflow.displayState === 'error')) return 'error';
  if (workflows.some((workflow) => workflow.displayState === 'warning')) return 'warning';
  if (workflows.some((workflow) => workflow.isActive)) return 'active';
  if (workflows.some((workflow) => workflow.isCompleteAcknowledgement)) return 'complete';
  if (workflows.some((workflow) => workflow.isStale)) return 'stale';
  return 'idle';
}

export function validPublicPayload(payload) {
  return Boolean(payload && payload.success === true && Number.isFinite(Date.parse(payload.fetchedAt))
    && Array.isArray(payload.workflows) && Array.isArray(payload.recentHistory)
    && payload.workflows.every(validEntry) && payload.recentHistory.every(validEntry));
}

function validEntry(entry) {
  return entry && typeof entry === 'object' && !Array.isArray(entry)
    && cleanToken(entry.workflow) && STATE_SET.has(entry.state)
    && Number.isFinite(Date.parse(entry.timestamp || entry.eventTimestamp || entry.updatedAt));
}

export function activityKey(workflow) {
  return workflow ? JSON.stringify([workflow.agent, workflow.workflow, workflow.startedAt,
    workflow.displayState, workflow.areaId, workflow.activity, workflow.context?.target]) : '';
}
const priority = (w) => !w?.isVisible ? 0 : w.isAttention ? 4 : w.isTransmission ? 3 : w.isActive ? 2 : 1;

export function normalizePublicState(payload = {}, now = Date.now(), { previousState = null, agent = null } = {}) {
  const rawWorkflows = Array.isArray(payload.workflows) ? payload.workflows : [];
  const rawHistory = Array.isArray(payload.recentHistory) ? payload.recentHistory : [];
  const workflows = rawWorkflows
    .filter((entry) => validEntry(entry) && (!agent || (entry.agent || 'spawncamper9000') === agent))
    .map((entry) => {
      const prior = previousState?.workflows.find((w) => w.agent === (entry.agent || 'spawncamper9000') && w.workflow === entry.workflow);
      const candidates = rawHistory.filter((e) => validEntry(e) && e.workflow === entry.workflow
        && (e.agent || 'spawncamper9000') === (entry.agent || 'spawncamper9000')
        && compareEvents(e, entry) <= 0
        && (!entry.startedAt || timestampMs(e.timestamp) >= timestampMs(entry.startedAt)))
        .sort((a, b) => compareEvents(b, a));
      const boundary = candidates.findIndex((e) => e.state === 'complete' && compareEvents(e, entry) < 0);
      const historyActivity = (boundary < 0 ? candidates : candidates.slice(0, boundary)).find((e) =>
        !['idle', 'waiting', 'complete', 'warning', 'error'].includes(e.state));
      const sameJob = prior && prior.startedAt === isoDate(entry.startedAt) && prior.state !== 'complete';
      const lastActivity = Object.hasOwn(entry, 'lastActivity') ? entry.lastActivity : historyActivity || (sameJob
        ? (!['idle', 'waiting', 'complete', 'warning', 'error'].includes(prior.state) ? prior : prior.lastActivity) : null);
      return normalizeWorkflow({ ...entry, lastActivity }, now);
    })
    .sort(compareWorkflow);
  const recentHistory = rawHistory
    .filter((entry) => validEntry(entry) && (!agent || (entry.agent || 'spawncamper9000') === agent))
    .map((event) => normalizeWorkflow(event, now, { history: true }))
    .sort(compareLatest);
  const activeWorkflows = workflows.filter((workflow) => workflow.isActive);
  const visibleWorkflows = workflows.filter((workflow) => workflow.isVisible);
  let primaryWorkflow = selectFocusWorkflow(workflows);
  const priorFocus = previousState?.primaryWorkflow;
  const retained = workflows.find((w) => w.agent === priorFocus?.agent && w.workflow === priorFocus?.workflow);
  if (retained?.isVisible && priority(retained) === priority(primaryWorkflow)) {
    const changed = workflows.filter((w) => priority(w) === priority(retained) && activityKey(w) !== activityKey(
      previousState?.workflows.find((old) => old.agent === w.agent && old.workflow === w.workflow)));
    primaryWorkflow = selectFocusWorkflow(changed) || retained;
  }
  const areaGroups = groupWorkflowsByArea(workflows);

  return {
    success: payload.success === true,
    fetchedAt: isoDate(payload.fetchedAt) || new Date(now).toISOString(),
    workflows,
    activeWorkflows,
    visibleWorkflows,
    areaGroups,
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
    areaGroups: groupWorkflowsByArea([]),
    recentHistory: [],
    primaryWorkflow: null,
    staleCount: 0,
    overallStatus: 'offline',
    message: cleanText(message, 180)
  };
}
