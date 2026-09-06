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

export function normalizeConnection(value) {
  if (CONNECTIONS.has(value)) return value;
  if (value === 'live' || value === 'syncing') return 'connected';
  if (value === 'offline') return 'disconnected';
  return 'connecting';
}

const latestFirst = (a, b) => (b.sortTime || Date.parse(b.timestamp) || 0) - (a.sortTime || Date.parse(a.timestamp) || 0);
const taskName = (workflow) => workflow?.taskTitle || workflow?.workflowLabel || workflow?.machineName || 'this task';

export function latestTerminalTask(state, terminalState = 'completed') {
  return [...(state.workflows || []), ...(state.recentHistory || [])]
    .filter((workflow) => workflow.taskState === terminalState)
    .sort(latestFirst)[0] || null;
}

export function presentCommandCenterState(state, { connection = 'connecting' } = {}) {
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

  return {
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
}

export { TASK_LABELS };
