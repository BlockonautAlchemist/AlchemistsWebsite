const { getSql } = require('./db');
const {
  COMMAND_CENTER_HISTORY_LIMIT_DEFAULT
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
    eventOrder: row.event_id || row.latest_event_id || row.id || null,
    lastActivity: sanitizedActivity(row.last_activity),
    agent: row.agent,
    workflow: row.workflow,
    workflowLabel: row.workflow_label,
    state: row.state,
    activity: row.activity,
    timestamp: isoDateTime(row.event_timestamp),
    startedAt: isoDateTime(row.started_at),
    ttlSeconds: numberOrDefault(row.ttl_seconds, 0),
    expiresAt,
    publicUrl: row.public_url || null,
    context: parseJsonObject(row.context),
    updatedAt: isoDateTime(row.updated_at),
    isStale: Boolean(expiresAtMs && expiresAtMs <= now)
  };
}

function toApiEvent(row, now = Date.now()) {
  const expiresAt = isoDateTime(row.expires_at);
  const expiresAtMs = expiresAt ? Date.parse(expiresAt) : 0;

  return {
    id: row.id,
    eventId: row.event_id || null,
    agent: row.agent,
    workflow: row.workflow,
    workflowLabel: row.workflow_label,
    state: row.state,
    activity: row.activity,
    timestamp: isoDateTime(row.event_timestamp),
    startedAt: isoDateTime(row.started_at),
    ttlSeconds: numberOrDefault(row.ttl_seconds, 0),
    expiresAt,
    publicUrl: row.public_url || null,
    context: parseJsonObject(row.context),
    receivedAt: isoDateTime(row.received_at),
    isStale: Boolean(expiresAtMs && expiresAtMs <= now)
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
        public_url, event_timestamp, started_at, ttl_seconds, expires_at
      ) VALUES (
        ${telemetry.eventId}, ${telemetry.agent}, ${telemetry.workflow},
        ${telemetry.workflowLabel}, ${telemetry.state}, ${telemetry.activity},
        ${JSON.stringify(telemetry.context || {})}::jsonb, ${telemetry.publicUrl},
        ${telemetry.timestamp}, ${telemetry.startedAt}, ${telemetry.ttlSeconds}, ${telemetry.expiresAt}
      )
      ON CONFLICT (agent, event_id) WHERE event_id IS NOT NULL
      DO UPDATE SET event_id = command_center_events.event_id
      RETURNING *, (xmax = 0) AS inserted
    ), advanced AS (
      INSERT INTO command_center_workflow_state (
        agent, workflow, latest_event_id, event_id, workflow_label, state, activity,
        context, public_url, event_timestamp, started_at, ttl_seconds, expires_at, updated_at
      ) SELECT agent, workflow, id, event_id, workflow_label, state, activity,
        context, public_url, event_timestamp, started_at, ttl_seconds, expires_at, now() FROM event
      ON CONFLICT (agent, workflow) DO UPDATE SET
        latest_event_id = EXCLUDED.latest_event_id, event_id = EXCLUDED.event_id,
        workflow_label = EXCLUDED.workflow_label, state = EXCLUDED.state,
        activity = EXCLUDED.activity, context = EXCLUDED.context, public_url = EXCLUDED.public_url,
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
        AND e.state NOT IN ('idle', 'waiting', 'complete', 'warning', 'error')
        AND (e.event_timestamp, COALESCE(e.event_id, e.id::text) COLLATE "C")
          <= (s.event_timestamp, COALESCE(s.event_id, s.latest_event_id::text) COLLATE "C")
        AND (s.started_at IS NULL OR e.event_timestamp >= s.started_at)
        AND NOT EXISTS (
          SELECT 1 FROM command_center_events boundary
          WHERE boundary.agent = s.agent AND boundary.workflow = s.workflow
            AND boundary.state = 'complete' AND boundary.id <> s.latest_event_id
            AND (boundary.event_timestamp, COALESCE(boundary.event_id, boundary.id::text) COLLATE "C")
              > (e.event_timestamp, COALESCE(e.event_id, e.id::text) COLLATE "C")
            AND (boundary.event_timestamp, COALESCE(boundary.event_id, boundary.id::text) COLLATE "C")
              <= (s.event_timestamp, COALESCE(s.event_id, s.latest_event_id::text) COLLATE "C")
        )
      ORDER BY e.event_timestamp DESC, COALESCE(e.event_id, e.id::text) COLLATE "C" DESC LIMIT 1
    ) activity ON true
    WHERE (${agent}::text IS NULL OR s.agent = ${agent})
    ORDER BY s.event_timestamp DESC, COALESCE(s.event_id, s.latest_event_id::text) COLLATE "C" DESC
    LIMIT 100
  `;
  const eventRows = historyLimit > 0 ? await sql`
    SELECT * FROM command_center_events
    WHERE (${agent}::text IS NULL OR agent = ${agent})
    ORDER BY event_timestamp DESC, COALESCE(event_id, id::text) COLLATE "C" DESC
    LIMIT ${historyLimit}
  ` : [];

  return {
    workflows: workflowRows.map((row) => toApiWorkflow(row, now)),
    recentHistory: eventRows.map((row) => toApiEvent(row, now))
  };
}

module.exports = {
  createTelemetry,
  listPublicCommandCenterState,
  toApiEvent,
  toApiWorkflow
};
