const CONNECTIONS = new Set(['connecting', 'connected', 'disconnected']);
const TASK_LABELS = Object.freeze({
  running: 'Working',
  waiting: 'Waiting',
  needs_attention: 'Needs attention',
  completed: 'Completed',
  failed: 'Failed',
  idle: 'Between tasks',
  unknown: 'Status unknown'
});

const FEED_STATE_LABELS = Object.freeze({
  idle: 'BETWEEN TASKS',
  researching: 'RESEARCHING',
  browsing: 'BROWSING',
  scanning: 'SCANNING',
  evaluating: 'EVALUATING',
  thinking: 'THINKING',
  writing: 'WRITING',
  coding: 'CODING',
  processing: 'PROCESSING',
  executing: 'EXECUTING',
  publishing: 'PUBLISHING',
  posting_to_x: 'POSTING TO X',
  newsletter: 'BUILDING NEWSLETTER',
  terminal_publish: 'PUBLISHING TO TERMINAL',
  waiting: 'WAITING',
  complete: 'COMPLETED',
  warning: 'NEEDS ATTENTION',
  error: 'FAILED'
});

const CRT_VARIANTS = Object.freeze({
  search: Object.freeze([
    Object.freeze(['> query trail in motion', '> filtering for a clean signal']),
    Object.freeze(['> signal sweep in motion', '> seeing what survives the filter'])
  ]),
  research: Object.freeze([
    Object.freeze(['> signals on the scope', '> separating signal from noise']),
    Object.freeze(['> sweep is running', '> checking the useful edges'])
  ]),
  reading: Object.freeze([
    Object.freeze(['> source window open', '> digging through the public trail']),
    Object.freeze(['> reading the source trail', '> looking for the useful bits'])
  ]),
  writing: Object.freeze([
    Object.freeze(['> trimming the noise', '> getting this into shape']),
    Object.freeze(['> draft pass in motion', '> tightening the signal'])
  ]),
  workbench: Object.freeze([
    Object.freeze(['> workbench is live', '> keeping the moving parts aligned']),
    Object.freeze(['> process loop engaged', '> checking each moving part'])
  ]),
  evaluate: Object.freeze([
    Object.freeze(['> comparison pass running', '> checking the edges']),
    Object.freeze(['> options on the bench', '> sorting signal from noise'])
  ]),
  publish: Object.freeze([
    Object.freeze(['> public uplink active', '> lining up the signal']),
    Object.freeze(['> transmission path live', '> sending the public packet'])
  ]),
  waiting: Object.freeze([
    Object.freeze(['> holding position', '> waiting on the next signal']),
    Object.freeze(['> work paused', '> standing by for clearance'])
  ]),
  attention: Object.freeze([
    Object.freeze(['> attention flag received', '> holding the safe line']),
    Object.freeze(['> caution light is on', '> waiting for a clean path'])
  ]),
  error: Object.freeze([
    Object.freeze(['> run fault reported', '> returning to a safe state']),
    Object.freeze(['> process fault received', '> holding for attention'])
  ]),
  complete: Object.freeze([
    Object.freeze(['> cycle complete', '> settling back to standby']),
    Object.freeze(['> public run complete', '> closing the work loop'])
  ]),
  unknown: Object.freeze([
    Object.freeze(['> status unconfirmed', '> waiting for a clean update']),
    Object.freeze(['> signal went quiet', '> holding the last safe state'])
  ])
});

export function normalizeConnection(value) {
  if (CONNECTIONS.has(value)) return value;
  if (value === 'live' || value === 'syncing') return 'connected';
  if (value === 'offline') return 'disconnected';
  return 'connecting';
}

const latestFirst = (a, b) => (b.sortTime || Date.parse(b.timestamp) || 0) - (a.sortTime || Date.parse(a.timestamp) || 0);
const taskName = (workflow) => workflow?.taskTitle || workflow?.workflowLabel || workflow?.machineName || 'this task';

function runKeyFor(entry) {
  if (!entry) return '';
  if (entry.runKey) return entry.runKey;
  const agent = entry.agent || 'spawncamper9000';
  if (entry.runId) return `${agent}:run:${entry.runId}`;
  if (entry.startedAt && entry.workflow) return `${agent}:started:${entry.workflow}:${new Date(entry.startedAt).toISOString()}`;
  return '';
}

function eventTime(event) {
  return Date.parse(event?.lastTimestamp || event?.timestamp || event?.updatedAt) || 0;
}

function eventOrder(event) {
  return String(event?.eventOrder || event?.eventId || event?.id || '');
}

function compareEvents(a, b) {
  return eventTime(a) - eventTime(b) || eventOrder(a).localeCompare(eventOrder(b));
}

function eventIdentity(event) {
  return event?.eventId || event?.id || JSON.stringify([
    runKeyFor(event), event?.state, event?.activity, event?.timestamp || event?.updatedAt || ''
  ]);
}

function collapseVisibleEvents(events) {
  const collapsed = [];
  events.forEach((event) => {
    const visibleKey = JSON.stringify([event.state, event.activity]);
    if (collapsed.at(-1)?.visibleKey === visibleKey) {
      collapsed[collapsed.length - 1] = { event, visibleKey };
    } else {
      collapsed.push({ event, visibleKey });
    }
  });
  return collapsed.map(({ event }) => event);
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function commentaryCategory(view) {
  if (view.taskState === 'unknown') return 'unknown';
  if (view.taskState === 'failed') return 'error';
  if (view.taskState === 'needs_attention') return 'attention';
  if (view.taskState === 'completed') return 'complete';
  if (view.taskState === 'waiting') return 'waiting';

  const state = view.focus?.displayState || view.focus?.state || 'idle';
  if (['publishing', 'posting_to_x', 'newsletter', 'terminal_publish'].includes(state)) return 'publish';

  const activity = String(view.focus?.activity || '').toLowerCase();
  if (/\b(search|searching|query|querying)\b/.test(activity)) return 'search';
  if (/\b(read|reading|browse|browsing)\b/.test(activity) || /https?:\/\/|\b[a-z0-9-]+\.(com|org|net|io)\b/.test(activity)) return 'reading';
  if (state === 'researching' || state === 'scanning') return 'research';
  if (state === 'browsing') return 'reading';
  if (state === 'writing') return 'writing';
  if (state === 'evaluating' || state === 'thinking') return 'evaluate';
  if (['coding', 'processing', 'executing'].includes(state)) return 'workbench';
  return 'research';
}

export function buildLiveActivityFeed(state, view, historyRuns = []) {
  if (view.connection !== 'connected' || view.taskState === 'unknown') {
    return {
      mode: 'unknown', workflowLabel: '', stateLabel: 'STATUS UNKNOWN', events: [],
      message: 'Current activity cannot be confirmed.',
      signature: 'unknown:Current activity cannot be confirmed.'
    };
  }

  const focus = view.focus;
  if (!focus || view.taskState === 'idle') {
    return {
      mode: 'idle', workflowLabel: '', stateLabel: 'BETWEEN TASKS', events: [],
      message: 'I’m not running a public task right now.',
      signature: 'idle:I’m not running a public task right now.'
    };
  }

  const focusRunKey = runKeyFor(focus);
  const backfill = focusRunKey
    ? historyRuns.filter((run) => runKeyFor(run) === focusRunKey).flatMap((run) => run.events || [])
    : [];
  const recent = focusRunKey
    ? (state.recentHistory || []).filter((event) => runKeyFor(event) === focusRunKey)
    : [];
  const merged = [...backfill, ...recent, focus];
  const unique = new Map();
  merged.forEach((event) => {
    if (event?.state !== 'idle' && event?.activity) unique.set(eventIdentity(event), event);
  });
  const events = collapseVisibleEvents([...unique.values()].sort(compareEvents))
    .slice(-6)
    .map((event) => ({
      state: event.state,
      activity: event.activity,
      timestamp: event.lastTimestamp || event.timestamp || event.updatedAt || ''
    }));
  const stateKey = focus.displayState || focus.state;
  const stateLabel = FEED_STATE_LABELS[stateKey]
    || (view.taskState === 'running' ? 'WORKING' : view.taskLabel.toUpperCase());
  const workflowLabel = taskName(focus).toUpperCase();
  return {
    mode: 'live', workflowLabel, stateLabel, events, message: '',
    signature: JSON.stringify([workflowLabel, stateLabel, events.map((event) => [event.state, event.activity])])
  };
}

export function buildCrtCommentary(view) {
  if (view.taskState === 'idle') {
    return {
      lines: ['> standing by', `> uplink ${view.connection}`, '> waiting for the next job'],
      tone: 'normal'
    };
  }

  if (view.taskState === 'unknown') {
    const link = view.connection === 'connected' ? '> last signal went quiet' : `> uplink ${view.connection}`;
    return { lines: ['> status unconfirmed', link, '> waiting for a clean update'], tone: 'attention' };
  }

  const category = commentaryCategory(view);
  const variants = CRT_VARIANTS[category];
  const focus = view.focus;
  const seed = JSON.stringify([
    focus?.workflow || '', focus?.displayState || focus?.state || '', focus?.activity || '',
    focus?.areaId || focus?.stationId || '', view.currentTaskCount, view.connection
  ]);
  return {
    lines: [...variants[stableHash(seed) % variants.length]],
    tone: ['attention', 'error'].includes(category) ? 'attention' : 'normal'
  };
}

export function latestTerminalTask(state, terminalState = 'completed') {
  return [...(state.workflows || []), ...(state.recentHistory || [])]
    .filter((workflow) => workflow.taskState === terminalState)
    .sort(latestFirst)[0] || null;
}

export function presentCommandCenterState(state, { connection = 'connecting', historyRuns = [] } = {}) {
  const connectionState = normalizeConnection(connection);
  const expiredFocus = (state.workflows || []).filter((workflow) => workflow.taskState === 'unknown')
    .sort(latestFirst)[0] || null;
  const focus = state.primaryWorkflow || expiredFocus;
  const current = (state.workflows || []).filter((workflow) =>
    workflow.freshness === 'fresh' && ['running', 'waiting', 'needs_attention'].includes(workflow.taskState));
  const latestCompleted = latestTerminalTask(state, 'completed');
  const latestFailed = latestTerminalTask(state, 'failed');
  let taskState = focus?.taskState || 'idle';
  if (connectionState !== 'connected') taskState = 'unknown';

  let narration = 'I’m not running a public task right now.';
  if (taskState === 'unknown') narration = 'Current activity cannot be confirmed.';
  else if (taskState === 'running') narration = `I’m working on ${taskName(focus)}.`;
  else if (taskState === 'waiting') narration = `I’m paused on ${taskName(focus)}.`;
  else if (taskState === 'needs_attention') narration = `${taskName(focus)} needs attention.`;
  else if (taskState === 'completed') narration = `I completed ${taskName(focus)}.`;
  else if (taskState === 'failed') narration = `${taskName(focus)} failed.`;

  const step = taskState === 'unknown' && focus?.activity ? `Last known: ${focus.activity}`
    : taskState === 'completed' || taskState === 'failed'
    ? focus?.outcome || focus?.activity || ''
    : taskState === 'idle' ? '' : focus?.activity || '';
  const timestamp = focus?.timestamp || state.fetchedAt || '';
  const machine = focus?.machineShortName || focus?.machineName || 'Ops';
  const characterLabel = taskState === 'idle' ? 'BETWEEN TASKS · OPS'
    : taskState === 'unknown' ? 'STATUS UNKNOWN'
      : `${TASK_LABELS[taskState].toUpperCase()} · ${String(machine).toUpperCase()}`;

  const view = {
    connection: connectionState,
    connectionLabel: connectionState === 'connected' ? 'Connected'
      : connectionState === 'disconnected' ? 'Disconnected' : 'Connecting',
    taskState,
    taskLabel: TASK_LABELS[taskState],
    narration,
    step,
    timestamp,
    currentTaskCount: connectionState === 'connected' ? current.length : 0,
    lastKnownTaskCount: current.length,
    currentTasks: current,
    focus,
    latestCompleted,
    latestFailed,
    characterLabel,
    freshness: focus?.freshness || 'not_applicable',
    meaningfulSignature: JSON.stringify([
      connectionState, focus?.runKey || focus?.id || '', focus?.taskState || 'idle',
      focus?.activity || '', focus?.outcome || ''
    ])
  };
  view.liveFeed = buildLiveActivityFeed(state, view, historyRuns);
  view.crt = buildCrtCommentary(view);
  return view;
}

export { TASK_LABELS };
