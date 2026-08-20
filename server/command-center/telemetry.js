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

function toApiWorkflow(row, now = Date.now()) {
  const expiresAt = isoDateTime(row.expires_at);
  const expiresAtMs = expiresAt ? Date.parse(expiresAt) : 0;

  return {
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

async function findDuplicateTelemetry(sql, telemetry) {
  if (!telemetry.eventId) return null;

  const rows = await sql`
    SELECT id
    FROM command_center_events
    WHERE agent = ${telemetry.agent}
      AND event_id = ${telemetry.eventId}
    LIMIT 1
  `;

  return rows[0] || null;
}

async function createTelemetry(telemetry) {
  const sql = getSql();
  const duplicate = await findDuplicateTelemetry(sql, telemetry);

  if (duplicate) {
    return {
      id: duplicate.id,
      status: 'duplicate',
      workflow: telemetry.workflow,
      agent: telemetry.agent
    };
  }

  const contextJson = JSON.stringify(telemetry.context || {});
  const insertedRows = await sql`
    INSERT INTO command_center_events (
      event_id,
      agent,
      workflow,
      workflow_label,
      state,
      activity,
      context,
      public_url,
      event_timestamp,
      started_at,
      ttl_seconds,
      expires_at
    )
    VALUES (
      ${telemetry.eventId},
      ${telemetry.agent},
      ${telemetry.workflow},
      ${telemetry.workflowLabel},
      ${telemetry.state},
      ${telemetry.activity},
      ${contextJson}::jsonb,
      ${telemetry.publicUrl},
      ${telemetry.timestamp},
      ${telemetry.startedAt},
      ${telemetry.ttlSeconds},
      ${telemetry.expiresAt}
    )
    ON CONFLICT DO NOTHING
    RETURNING id
  `;

  if (!insertedRows[0]) {
    const racedDuplicate = await findDuplicateTelemetry(sql, telemetry);
    if (racedDuplicate) {
      return {
        id: racedDuplicate.id,
        status: 'duplicate',
        workflow: telemetry.workflow,
        agent: telemetry.agent
      };
    }

    throw new Error('Command Center telemetry insert was not persisted.');
  }

  const latestEventId = insertedRows[0].id;
  await sql`
    INSERT INTO command_center_workflow_state (
      agent,
      workflow,
      latest_event_id,
      event_id,
      workflow_label,
      state,
      activity,
      context,
      public_url,
      event_timestamp,
      started_at,
      ttl_seconds,
      expires_at,
      updated_at
    )
    VALUES (
      ${telemetry.agent},
      ${telemetry.workflow},
      ${latestEventId},
      ${telemetry.eventId},
      ${telemetry.workflowLabel},
      ${telemetry.state},
      ${telemetry.activity},
      ${contextJson}::jsonb,
      ${telemetry.publicUrl},
      ${telemetry.timestamp},
      ${telemetry.startedAt},
      ${telemetry.ttlSeconds},
      ${telemetry.expiresAt},
      now()
    )
    ON CONFLICT (agent, workflow) DO UPDATE
    SET
      latest_event_id = EXCLUDED.latest_event_id,
      event_id = EXCLUDED.event_id,
      workflow_label = EXCLUDED.workflow_label,
      state = EXCLUDED.state,
      activity = EXCLUDED.activity,
      context = EXCLUDED.context,
      public_url = EXCLUDED.public_url,
      event_timestamp = EXCLUDED.event_timestamp,
      started_at = EXCLUDED.started_at,
      ttl_seconds = EXCLUDED.ttl_seconds,
      expires_at = EXCLUDED.expires_at,
      updated_at = now()
    WHERE command_center_workflow_state.event_timestamp <= EXCLUDED.event_timestamp
  `;

  return {
    id: latestEventId,
    status: 'created',
    workflow: telemetry.workflow,
    agent: telemetry.agent
  };
}

async function listPublicCommandCenterState({
  historyLimit = COMMAND_CENTER_HISTORY_LIMIT_DEFAULT,
  now = Date.now()
} = {}) {
  const sql = getSql();

  const workflowRows = await sql`
    SELECT
      agent,
      workflow,
      workflow_label,
      state,
      activity,
      context,
      public_url,
      event_timestamp,
      started_at,
      ttl_seconds,
      expires_at,
      updated_at
    FROM command_center_workflow_state
    ORDER BY updated_at DESC, workflow ASC
    LIMIT 100
  `;

  const eventRows = historyLimit > 0
    ? await sql`
      SELECT
        id,
        event_id,
        agent,
        workflow,
        workflow_label,
        state,
        activity,
        context,
        public_url,
        event_timestamp,
        started_at,
        ttl_seconds,
        expires_at,
        received_at
      FROM command_center_events
      ORDER BY event_timestamp DESC, received_at DESC, id DESC
      LIMIT ${historyLimit}
    `
    : [];

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
