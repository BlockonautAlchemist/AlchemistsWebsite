const { getSql } = require('./db');
const crypto = require('node:crypto');
const {
  COMMAND_CENTER_HISTORY_LIMIT_DEFAULT,
  commandCenterWorkflowLabel
} = require('./constants');

function parseJsonObject(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  return {};
}

function isoDateTime(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? String(value || '') : new Date(timestamp).toISOString();
}

function numberOrDefault(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

const TERMINAL_STATES = new Set(['idle', 'complete', 'error']);

function freshnessFor(row, now) {
  if (TERMINAL_STATES.has(row.state)) return 'not_applicable';
  const expiresAt = isoDateTime(row.expires_at);
  return expiresAt && Date.parse(expiresAt) <= now ? 'expired' : 'fresh';
}

function sanitizedActivity(value) {
  const entry = parseJsonObject(value);
  if (!entry.workflow || !entry.state || !entry.timestamp) return null;
  const context = parseJsonObject(entry.context);
  return { workflow: String(entry.workflow).slice(0, 80), state: String(entry.state).slice(0, 40),
    timestamp: isoDateTime(entry.timestamp), context: typeof context.station === 'string'
      ? { station: context.station.slice(0, 80) } : {} };
}

function toApiWorkflow(row, now = Date.now()) {
  const expiresAt = isoDateTime(row.expires_at);
  const expiresAtMs = expiresAt ? Date.parse(expiresAt) : 0;

  return {
    id: row.latest_event_id || row.id || null,
    eventId: row.event_id || null,
    runId: row.run_id || null,
    eventOrder: row.event_id || row.latest_event_id || row.id || null,
    lastActivity: sanitizedActivity(row.last_activity),
    agent: row.agent,
    workflow: row.workflow,
    workflowLabel: commandCenterWorkflowLabel(row.workflow, row.workflow_label),
    taskTitle: row.task_title || null,
    state: row.state,
    activity: row.activity,
    outcome: row.outcome || null,
    timestamp: isoDateTime(row.event_timestamp),
    startedAt: isoDateTime(row.started_at),
    ttlSeconds: numberOrDefault(row.ttl_seconds, 0),
    expiresAt,
    publicUrl: row.public_url || null,
    context: parseJsonObject(row.context),
    updatedAt: isoDateTime(row.updated_at),
    visibility: row.visibility || 'public',
    freshness: freshnessFor(row, now),
    isStale: !TERMINAL_STATES.has(row.state) && Boolean(expiresAtMs && expiresAtMs <= now)
  };
}

function toApiEvent(row, now = Date.now()) {
  const expiresAt = isoDateTime(row.expires_at);
  const expiresAtMs = expiresAt ? Date.parse(expiresAt) : 0;

  return {
    id: row.id,
    eventId: row.event_id || null,
    runId: row.run_id || null,
    agent: row.agent,
    workflow: row.workflow,
    workflowLabel: commandCenterWorkflowLabel(row.workflow, row.workflow_label),
    taskTitle: row.task_title || null,
    state: row.state,
    activity: row.activity,
    outcome: row.outcome || null,
    timestamp: isoDateTime(row.event_timestamp),
    startedAt: isoDateTime(row.started_at),
    ttlSeconds: numberOrDefault(row.ttl_seconds, 0),
    expiresAt,
    publicUrl: row.public_url || null,
    context: parseJsonObject(row.context),
    receivedAt: isoDateTime(row.received_at),
    visibility: row.visibility || 'public',
    freshness: freshnessFor(row, now),
    isStale: !TERMINAL_STATES.has(row.state) && Boolean(expiresAtMs && expiresAtMs <= now)
  };
}

// One PostgreSQL statement: a retry returns the original event and also repairs
// latest state. ON CONFLICT waits for concurrent duplicates, unlike a preflight
// SELECT or an INSERT DO NOTHING followed by a same-snapshot SELECT.
async function createTelemetry(telemetry) {
  const sql = getSql();
  const rows = await sql`
    WITH event AS (
      INSERT INTO command_center_events (
        event_id, agent, workflow, workflow_label, state, activity, context,
        public_url, event_timestamp, started_at, ttl_seconds, expires_at,
        run_id, task_title, outcome, visibility
      ) VALUES (
        ${telemetry.eventId}, ${telemetry.agent}, ${telemetry.workflow},
        ${telemetry.workflowLabel}, ${telemetry.state}, ${telemetry.activity},
        ${JSON.stringify(telemetry.context || {})}::jsonb, ${telemetry.publicUrl},
        ${telemetry.timestamp}, ${telemetry.startedAt}, ${telemetry.ttlSeconds}, ${telemetry.expiresAt},
        ${telemetry.runId}, ${telemetry.taskTitle}, ${telemetry.outcome}, ${telemetry.visibility}
      )
      ON CONFLICT (agent, event_id) WHERE event_id IS NOT NULL
      DO UPDATE SET event_id = command_center_events.event_id
      RETURNING *, (xmax = 0) AS inserted
    ), advanced AS (
      INSERT INTO command_center_workflow_state (
        agent, workflow, latest_event_id, event_id, run_id, workflow_label, task_title,
        state, activity, outcome, context, public_url, visibility, event_timestamp,
        started_at, ttl_seconds, expires_at, updated_at
      ) SELECT agent, workflow, id, event_id, run_id, workflow_label, task_title,
        state, activity, outcome, context, public_url, visibility, event_timestamp,
        started_at, ttl_seconds, expires_at, now() FROM event
      WHERE visibility = 'public'
      ON CONFLICT (agent, workflow) DO UPDATE SET
        latest_event_id = EXCLUDED.latest_event_id, event_id = EXCLUDED.event_id,
        run_id = EXCLUDED.run_id, workflow_label = EXCLUDED.workflow_label,
        task_title = EXCLUDED.task_title, state = EXCLUDED.state,
        activity = EXCLUDED.activity, outcome = EXCLUDED.outcome,
        context = EXCLUDED.context, public_url = EXCLUDED.public_url, visibility = EXCLUDED.visibility,
        event_timestamp = EXCLUDED.event_timestamp, started_at = EXCLUDED.started_at,
        ttl_seconds = EXCLUDED.ttl_seconds, expires_at = EXCLUDED.expires_at, updated_at = now()
      WHERE (command_center_workflow_state.event_timestamp,
        COALESCE(command_center_workflow_state.event_id, command_center_workflow_state.latest_event_id::text) COLLATE "C")
        < (EXCLUDED.event_timestamp, COALESCE(EXCLUDED.event_id, EXCLUDED.latest_event_id::text) COLLATE "C")
        OR (command_center_workflow_state.latest_event_id IS NULL
          AND command_center_workflow_state.event_timestamp = EXCLUDED.event_timestamp
          AND command_center_workflow_state.event_id = EXCLUDED.event_id)
      RETURNING latest_event_id
    ) SELECT id, agent, workflow, inserted FROM event
  `;
  if (!rows[0]) throw new Error('Command Center telemetry was not persisted.');
  const row = rows[0];
  return { id: row.id, status: row.inserted ? 'created' : 'duplicate', workflow: row.workflow, agent: row.agent };
}

async function listPublicCommandCenterState({
  historyLimit = COMMAND_CENTER_HISTORY_LIMIT_DEFAULT,
  agent = null,
  now = Date.now()
} = {}) {
  const sql = getSql();

  const workflowRows = await sql`
    SELECT s.*, activity.reference AS last_activity
    FROM command_center_workflow_state s
    LEFT JOIN LATERAL (
      SELECT jsonb_build_object('workflow', e.workflow, 'state', e.state,
        'timestamp', e.event_timestamp, 'context', e.context) AS reference
      FROM command_center_events e
      WHERE e.agent = s.agent AND e.workflow = s.workflow
        AND e.visibility = 'public'
        AND e.state NOT IN ('idle', 'waiting', 'complete', 'warning', 'error')
        AND (e.event_timestamp, COALESCE(e.event_id, e.id::text) COLLATE "C")
          <= (s.event_timestamp, COALESCE(s.event_id, s.latest_event_id::text) COLLATE "C")
        AND (s.started_at IS NULL OR e.event_timestamp >= s.started_at)
        AND NOT EXISTS (
          SELECT 1 FROM command_center_events boundary
          WHERE boundary.agent = s.agent AND boundary.workflow = s.workflow
            AND boundary.visibility = 'public'
            AND boundary.state = 'complete' AND boundary.id <> s.latest_event_id
            AND (boundary.event_timestamp, COALESCE(boundary.event_id, boundary.id::text) COLLATE "C")
              > (e.event_timestamp, COALESCE(e.event_id, e.id::text) COLLATE "C")
            AND (boundary.event_timestamp, COALESCE(boundary.event_id, boundary.id::text) COLLATE "C")
              <= (s.event_timestamp, COALESCE(s.event_id, s.latest_event_id::text) COLLATE "C")
        )
      ORDER BY e.event_timestamp DESC, COALESCE(e.event_id, e.id::text) COLLATE "C" DESC LIMIT 1
    ) activity ON true
    WHERE s.visibility = 'public' AND (${agent}::text IS NULL OR s.agent = ${agent})
    ORDER BY s.event_timestamp DESC, COALESCE(s.event_id, s.latest_event_id::text) COLLATE "C" DESC
    LIMIT 100
  `;
  const eventRows = historyLimit > 0 ? await sql`
    SELECT * FROM command_center_events
    WHERE visibility = 'public' AND (${agent}::text IS NULL OR agent = ${agent})
    ORDER BY event_timestamp DESC, COALESCE(event_id, id::text) COLLATE "C" DESC
    LIMIT ${historyLimit}
  ` : [];

  return {
    workflows: workflowRows.map((row) => toApiWorkflow(row, now)),
    recentHistory: eventRows.map((row) => toApiEvent(row, now))
  };
}

const RUN_EVENT_DETAIL_LIMIT = 20;
const ACTIVE_STATES = new Set([
  'researching', 'browsing', 'scanning', 'evaluating', 'thinking', 'writing',
  'coding', 'processing', 'executing', 'publishing', 'posting_to_x',
  'newsletter', 'terminal_publish'
]);

function eventDisplayKey(event) {
  return JSON.stringify([event.state, event.activity, event.outcome, event.publicUrl, event.context]);
}

function collapseRunEvents(events, { detailLimit = RUN_EVENT_DETAIL_LIMIT } = {}) {
  const collapsed = [];
  events.forEach((event) => {
    const previous = collapsed.at(-1);
    if (previous && eventDisplayKey(previous) === eventDisplayKey(event)) {
      previous.occurrenceCount += 1;
      previous.lastTimestamp = event.timestamp;
      return;
    }
    collapsed.push({ ...event, occurrenceCount: 1, firstTimestamp: event.timestamp, lastTimestamp: event.timestamp });
  });
  const visible = collapsed.slice(-detailLimit);
  const omittedEventCount = collapsed.slice(0, -detailLimit)
    .reduce((total, event) => total + event.occurrenceCount, 0);
  return { events: visible, omittedEventCount };
}

function historyTaskState(event, now) {
  if (event.state === 'complete') return 'completed';
  if (event.state === 'error') return 'failed';
  if (event.state === 'idle') return 'idle';
  if (event.freshness === 'expired' || (event.expiresAt && Date.parse(event.expiresAt) <= now)) return 'unknown';
  if (event.state === 'waiting') return 'waiting';
  if (event.state === 'warning') return 'needs_attention';
  return ACTIVE_STATES.has(event.state) ? 'running' : 'unknown';
}

function publicRunId(agent, runKey) {
  return crypto.createHash('sha256').update(`${agent}\0${runKey}`).digest('hex').slice(0, 24);
}

function encodeCursor(row) {
  return Buffer.from(JSON.stringify({
    v: 1,
    timestamp: isoDateTime(row.updatedAt || row.ended_at),
    order: row._order || row.run_order,
    key: row._key || row.run_key
  })).toString('base64url');
}

function runIdentityForEvent(event) {
  const agent = event.agent || 'spawncamper9000';
  if (event.runId) return `${agent}:run:${event.runId}`;
  if (event.startedAt) return `${agent}:started:${event.workflow}:${isoDateTime(event.startedAt)}`;
  if (event.state === 'complete' || event.state === 'error') {
    return `${agent}:event:${event.id || event.eventId || `${event.workflow}:${event.timestamp}`}`;
  }
  return null;
}

/** Pure compatibility model used by tests and non-SQL consumers. */
function groupPublicEventsIntoRuns(events, { now = Date.now(), includeInternal = false } = {}) {
  const groups = new Map();
  events.filter((event) => (event.visibility || 'public') === 'public').forEach((event) => {
    const key = runIdentityForEvent(event);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  });
  const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  const compare = (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)
    || compareText(String(a.eventId || a.id || ''), String(b.eventId || b.id || ''));
  return [...groups.entries()].map(([key, grouped]) => {
    const ordered = grouped.slice().sort(compare);
    const latest = ordered.at(-1);
    const { events: details, omittedEventCount } = collapseRunEvents(ordered);
    const recentWith = (field) => [...ordered].reverse().find((event) => event[field])?.[field] || null;
    return {
      id: publicRunId(latest.agent || 'spawncamper9000', key),
      runId: latest.runId || null,
      agent: latest.agent || 'spawncamper9000',
      workflow: latest.workflow,
      workflowLabel: commandCenterWorkflowLabel(latest.workflow, latest.workflowLabel),
      taskTitle: recentWith('taskTitle'),
      outcome: recentWith('outcome'),
      state: latest.state,
      taskState: historyTaskState(latest, now),
      startedAt: ordered[0].startedAt || ordered[0].timestamp,
      updatedAt: latest.timestamp,
      publicUrl: recentWith('publicUrl'),
      totalEventCount: ordered.length,
      omittedEventCount,
      events: details,
      _order: String(latest.eventId || latest.id || ''),
      _key: key
    };
  }).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
    || compareText(b._order, a._order) || compareText(b._key, a._key))
    .map(({ _order, _key, ...run }) => includeInternal ? { ...run, _order, _key } : run);
}

async function listPublicRunHistory({ agent = null, limit = 8, cursor = null, now = Date.now() } = {}) {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM command_center_events
    WHERE visibility = 'public'
      AND (${agent}::text IS NULL OR agent = ${agent})
      AND (run_id IS NOT NULL OR started_at IS NOT NULL OR state IN ('complete', 'error'))
    ORDER BY event_timestamp DESC, COALESCE(event_id, id::text) COLLATE "C" DESC
  `;
  const runs = groupPublicEventsIntoRuns(rows.map((row) => toApiEvent(row, now)), { now, includeInternal: true });
  const afterCursor = cursor ? runs.filter((run) => {
    const timeDelta = Date.parse(run.updatedAt) - Date.parse(cursor.timestamp);
    if (timeDelta) return timeDelta < 0;
    const orderDelta = run._order < cursor.order ? -1 : run._order > cursor.order ? 1 : 0;
    return orderDelta ? orderDelta < 0 : run._key < cursor.key;
  }) : runs;
  const pageRows = afterCursor.slice(0, limit);
  return {
    runs: pageRows.map(({ _order, _key, ...run }) => run),
    nextCursor: afterCursor.length > limit ? encodeCursor(pageRows.at(-1)) : null
  };
}

module.exports = {
  createTelemetry,
  collapseRunEvents,
  groupPublicEventsIntoRuns,
  listPublicCommandCenterState,
  listPublicRunHistory,
  toApiEvent,
  toApiWorkflow
};
