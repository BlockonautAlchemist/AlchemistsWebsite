const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const commandCenterStateHandler = require('../api/command-center/state');
const commandCenterTelemetryHandler = require('../api/command-center/telemetry');
const { _setSqlForTests } = require('../server/command-center/db');
const { commandCenterStorageError } = require('../server/command-center/errors');
const {
  createTelemetry,
  listPublicCommandCenterState
} = require('../server/command-center/telemetry');
const { validateTelemetryPayload } = require('../server/command-center/validation');

const originalIngestSecret = process.env.COMMAND_CENTER_INGEST_SECRET;
const originalDatabaseUrl = process.env.DATABASE_URL;

let fallbackCommandCenterState;
let normalizePublicState;

test.before(async () => {
  ({
    fallbackCommandCenterState,
    normalizePublicState
  } = await import('../src/command-center/stateModel.mjs'));
});

test.afterEach(() => {
  _setSqlForTests(null);

  if (originalIngestSecret === undefined) delete process.env.COMMAND_CENTER_INGEST_SECRET;
  else process.env.COMMAND_CENTER_INGEST_SECRET = originalIngestSecret;

  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
});

function sampleTelemetry(overrides = {}) {
  return {
    eventId: 'event-1',
    agent: 'spawncamper9000',
    workflow: 'new-tools',
    workflowLabel: 'New Tools',
    state: 'researching',
    activity: 'Scanning AI gaming tools',
    timestamp: new Date(Date.now() - 1000).toISOString(),
    startedAt: new Date(Date.now() - 1000).toISOString(),
    ttlSeconds: 900,
    publicUrl: 'https://Example.com/post/123',
    context: {
      station: 'scanner',
      target: 'AI gaming tools',
      count: 12
    },
    ...overrides
  };
}

function makeCommandCenterSqlStore(initialEvents = []) {
  const events = [...initialEvents];
  const workflowState = new Map();
  const calls = [];

  function keyFor(agent, workflow) {
    return `${agent}:${workflow}`;
  }

  function latestSort(a, b) {
    const eventDelta = Date.parse(b.event_timestamp) - Date.parse(a.event_timestamp);
    if (eventDelta) return eventDelta;

    const receivedDelta = Date.parse(b.received_at) - Date.parse(a.received_at);
    if (receivedDelta) return receivedDelta;

    return String(b.id).localeCompare(String(a.id));
  }

  async function sql(strings, ...values) {
    const query = strings.join(' ').replace(/\s+/g, ' ').trim().toLowerCase();
    calls.push({ query, values });

    if (query.includes('select id from command_center_events')) {
      const [agent, eventId] = values;
      const match = events.find((event) => event.agent === agent && event.event_id === eventId);
      return match ? [{ id: match.id }] : [];
    }

    if (query.includes('insert into command_center_events')) {
      const [
        eventId,
        agent,
        workflow,
        workflowLabel,
        state,
        activity,
        contextJson,
        publicUrl,
        eventTimestamp,
        startedAt,
        ttlSeconds,
        expiresAt
      ] = values;
      const duplicate = eventId
        ? events.find((event) => event.agent === agent && event.event_id === eventId)
        : null;

      if (duplicate) return [];

      const row = {
        id: `command-event-${events.length + 1}`,
        event_id: eventId,
        agent,
        workflow,
        workflow_label: workflowLabel,
        state,
        activity,
        context: JSON.parse(contextJson),
        public_url: publicUrl,
        event_timestamp: eventTimestamp,
        started_at: startedAt,
        ttl_seconds: ttlSeconds,
        expires_at: expiresAt,
        received_at: new Date(Date.parse(eventTimestamp) + 500).toISOString()
      };

      events.push(row);
      return [{ id: row.id }];
    }

    if (query.includes('insert into command_center_workflow_state')) {
      const [
        agent,
        workflow,
        latestEventId,
        eventId,
        workflowLabel,
        state,
        activity,
        contextJson,
        publicUrl,
        eventTimestamp,
        startedAt,
        ttlSeconds,
        expiresAt
      ] = values;
      const key = keyFor(agent, workflow);
      const current = workflowState.get(key);

      if (!current || Date.parse(current.event_timestamp) <= Date.parse(eventTimestamp)) {
        workflowState.set(key, {
          agent,
          workflow,
          latest_event_id: latestEventId,
          event_id: eventId,
          workflow_label: workflowLabel,
          state,
          activity,
          context: JSON.parse(contextJson),
          public_url: publicUrl,
          event_timestamp: eventTimestamp,
          started_at: startedAt,
          ttl_seconds: ttlSeconds,
          expires_at: expiresAt,
          updated_at: new Date(Date.parse(eventTimestamp) + 1000).toISOString()
        });
      }

      return [];
    }

    if (query.includes('from command_center_workflow_state')) {
      return Array.from(workflowState.values())
        .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
        .slice(0, 100);
    }

    if (query.includes('from command_center_events')) {
      const limit = values[0];
      return events
        .slice()
        .sort(latestSort)
        .slice(0, limit);
    }

    throw new Error(`Unexpected SQL in command center test: ${query}`);
  }

  return {
    calls,
    events,
    sql,
    workflowState
  };
}

async function invokeHandler(handler, {
  method = 'GET',
  url = '/api/command-center/state',
  body,
  headers = {}
} = {}) {
  const response = {
    headers: {},
    statusCode: 200,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(payload) {
      this.payload = payload;
    }
  };

  await handler({
    method,
    url,
    headers,
    body,
    on() {}
  }, response);

  return {
    statusCode: response.statusCode,
    headers: response.headers,
    body: response.payload ? JSON.parse(response.payload) : {}
  };
}

test('validates command center telemetry and computes TTL expiry', () => {
  const now = Date.parse('2026-08-20T20:04:00.000Z');
  const telemetry = validateTelemetryPayload(sampleTelemetry({
    agent: undefined,
    timestamp: '2026-08-20T16:03:00-04:00',
    startedAt: '2026-08-20T16:02:30-04:00',
    workflow: 'New-Tools',
    workflowLabel: undefined,
    state: 'RESEARCHING',
    publicUrl: 'https://Example.com/post/123'
  }), { now });

  assert.equal(telemetry.agent, 'spawncamper9000');
  assert.equal(telemetry.workflow, 'new-tools');
  assert.equal(telemetry.workflowLabel, 'New Tools');
  assert.equal(telemetry.state, 'researching');
  assert.equal(telemetry.timestamp, '2026-08-20T20:03:00.000Z');
  assert.equal(telemetry.startedAt, '2026-08-20T20:02:30.000Z');
  assert.equal(telemetry.expiresAt, '2026-08-20T20:18:00.000Z');
  assert.equal(telemetry.publicUrl, 'https://example.com/post/123');
  assert.deepEqual(telemetry.context, {
    station: 'scanner',
    target: 'AI gaming tools',
    count: 12
  });
});

test('rejects unsupported command center telemetry fields and unsafe values', () => {
  const now = Date.parse('2026-08-20T20:04:00.000Z');

  assert.throws(
    () => validateTelemetryPayload(sampleTelemetry({ rawLog: 'do not ingest' }), { now }),
    /unsupported fields/
  );
  assert.throws(
    () => validateTelemetryPayload(sampleTelemetry({ state: 'drafting' }), { now }),
    /state is not allowed/
  );
  assert.throws(
    () => validateTelemetryPayload(sampleTelemetry({ publicUrl: 'https://token@example.com/post' }), { now }),
    /embedded credentials/
  );
  assert.throws(
    () => validateTelemetryPayload(sampleTelemetry({ context: { station: 'scanner', secret: 'x' } }), { now }),
    /context includes unsupported fields/
  );
  assert.throws(
    () => validateTelemetryPayload(sampleTelemetry({ timestamp: '2026-08-20T20:20:00Z' }), { now }),
    /future/
  );
  assert.throws(
    () => validateTelemetryPayload(sampleTelemetry({ ttlSeconds: 10 }), { now }),
    /ttlSeconds must be between/
  );
});

test('creates telemetry, dedupes event IDs, and exposes sanitized public state', async () => {
  const store = makeCommandCenterSqlStore();
  _setSqlForTests(store.sql);
  const now = Date.parse('2026-08-20T20:04:00.000Z');
  const first = validateTelemetryPayload(sampleTelemetry({
    timestamp: '2026-08-20T20:03:00Z',
    startedAt: '2026-08-20T20:03:00Z'
  }), { now });

  const created = await createTelemetry(first);
  assert.deepEqual(created, {
    id: 'command-event-1',
    status: 'created',
    workflow: 'new-tools',
    agent: 'spawncamper9000'
  });

  const duplicate = await createTelemetry(first);
  assert.deepEqual(duplicate, {
    id: 'command-event-1',
    status: 'duplicate',
    workflow: 'new-tools',
    agent: 'spawncamper9000'
  });

  const newer = validateTelemetryPayload(sampleTelemetry({
    eventId: 'event-2',
    state: 'complete',
    activity: 'Tool sweep complete',
    timestamp: '2026-08-20T20:04:00Z',
    startedAt: '2026-08-20T20:03:00Z'
  }), { now });
  await createTelemetry(newer);

  const publicState = await listPublicCommandCenterState({ historyLimit: 2, now });
  assert.equal(publicState.workflows.length, 1);
  assert.equal(publicState.workflows[0].state, 'complete');
  assert.equal(publicState.workflows[0].activity, 'Tool sweep complete');
  assert.equal(publicState.workflows[0].context.target, 'AI gaming tools');
  assert.equal(publicState.recentHistory.length, 2);
  assert.equal(publicState.recentHistory[0].state, 'complete');
  assert.equal(store.events.length, 2);
});

test('normalizes command center public state and expires stale workflows visually', () => {
  const now = Date.parse('2026-08-20T20:20:00.000Z');
  const state = normalizePublicState({
    success: true,
    fetchedAt: '2026-08-20T20:20:00Z',
    workflows: [
      {
        agent: 'spawncamper9000',
        workflow: 'new-tools',
        workflowLabel: 'New Tools',
        state: 'researching',
        activity: 'Scanning',
        timestamp: '2026-08-20T20:19:00Z',
        ttlSeconds: 900,
        expiresAt: '2026-08-20T20:34:00Z',
        context: { station: 'scanner' }
      },
      {
        agent: 'spawncamper9000',
        workflow: 'newsletter',
        workflowLabel: 'Newsletter',
        state: 'writing',
        activity: 'Old heartbeat',
        timestamp: '2026-08-20T20:00:00Z',
        ttlSeconds: 60,
        expiresAt: '2026-08-20T20:01:00Z',
        context: { station: 'newsletter' }
      }
    ]
  }, now);

  assert.equal(state.overallStatus, 'active');
  assert.equal(state.activeWorkflows.length, 1);
  assert.equal(state.primaryWorkflow.workflow, 'new-tools');
  const stale = state.workflows.find((workflow) => workflow.workflow === 'newsletter');
  assert.equal(stale.isStale, true);
  assert.equal(stale.displayState, 'idle');
  assert.equal(stale.stationId, 'newsletter');

  const fallback = fallbackCommandCenterState({ message: 'database unavailable', now });
  assert.equal(fallback.overallStatus, 'offline');
  assert.equal(fallback.message, 'database unavailable');
});

test('command center API enforces POST auth and accepts public GET', async () => {
  const store = makeCommandCenterSqlStore();
  _setSqlForTests(store.sql);
  process.env.COMMAND_CENTER_INGEST_SECRET = 'command-secret';

  const unauthenticated = await invokeHandler(commandCenterTelemetryHandler, {
    method: 'POST',
    url: '/api/command-center/telemetry',
    body: sampleTelemetry()
  });
  assert.equal(unauthenticated.statusCode, 401);
  assert.equal(unauthenticated.body.success, false);

  const created = await invokeHandler(commandCenterTelemetryHandler, {
    method: 'POST',
    url: '/api/command-center/telemetry',
    headers: { authorization: 'Bearer command-secret' },
    body: sampleTelemetry()
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.body.status, 'created');
  assert.equal(created.body.workflow, 'new-tools');

  const duplicate = await invokeHandler(commandCenterTelemetryHandler, {
    method: 'POST',
    url: '/api/command-center/telemetry',
    headers: { authorization: 'Bearer command-secret' },
    body: sampleTelemetry()
  });
  assert.equal(duplicate.statusCode, 200);
  assert.equal(duplicate.body.status, 'duplicate');

  const listed = await invokeHandler(commandCenterStateHandler, {
    method: 'GET',
    url: '/api/command-center/state?historyLimit=1'
  });
  assert.equal(listed.statusCode, 200);
  assert.equal(listed.body.success, true);
  assert.equal(listed.body.workflows.length, 1);
  assert.equal(listed.body.recentHistory.length, 1);
  assert.equal(listed.body.workflows[0].publicUrl, 'https://example.com/post/123');
});

test('command center API rejects malformed payloads and unsupported methods', async () => {
  _setSqlForTests(makeCommandCenterSqlStore().sql);
  process.env.COMMAND_CENTER_INGEST_SECRET = 'command-secret';

  const malformed = await invokeHandler(commandCenterTelemetryHandler, {
    method: 'POST',
    url: '/api/command-center/telemetry',
    headers: { authorization: 'Bearer command-secret' },
    body: sampleTelemetry({ activity: '' })
  });
  assert.equal(malformed.statusCode, 400);

  const unsupportedPost = await invokeHandler(commandCenterStateHandler, {
    method: 'POST',
    url: '/api/command-center/state'
  });
  assert.equal(unsupportedPost.statusCode, 405);
  assert.equal(unsupportedPost.headers.allow, 'GET, OPTIONS');

  const unsupportedGet = await invokeHandler(commandCenterTelemetryHandler, {
    method: 'GET',
    url: '/api/command-center/telemetry'
  });
  assert.equal(unsupportedGet.statusCode, 405);
  assert.equal(unsupportedGet.headers.allow, 'POST, OPTIONS');

  const invalidHistoryLimit = await invokeHandler(commandCenterStateHandler, {
    method: 'GET',
    url: '/api/command-center/state?historyLimit=999'
  });
  assert.equal(invalidHistoryLimit.statusCode, 400);
});

test('command center storage errors hide raw database details for unmigrated tables', () => {
  const error = commandCenterStorageError({ code: '42P01', message: 'relation does not exist' });

  assert.equal(error.statusCode, 503);
  assert.equal(error.message, 'Command Center telemetry store is not migrated yet.');
});

test('command center page is wired as a public read-only route', () => {
  const html = fs.readFileSync(`${__dirname}/../command-center.html`, 'utf8');
  const script = fs.readFileSync(`${__dirname}/../command-center.js`, 'utf8');
  const styles = fs.readFileSync(`${__dirname}/../command-center.css`, 'utf8');
  const index = fs.readFileSync(`${__dirname}/../index.html`, 'utf8');
  const viteConfig = fs.readFileSync(`${__dirname}/../vite.config.js`, 'utf8');
  const vercelConfig = fs.readFileSync(`${__dirname}/../vercel.json`, 'utf8');

  assert.match(html, /id="cc-canvas"/);
  assert.match(html, /src="command-center\.js"/);
  assert.doesNotMatch(html, /method="post"/i);
  assert.doesNotMatch(html, /cc-refresh|Refresh command center state/i);
  assert.doesNotMatch(script, /cc-refresh|Refresh command center state/i);
  assert.doesNotMatch(styles, /\.cc-refresh/);
  assert.match(index, /href="\/command-center"/);
  assert.match(viteConfig, /commandCenter/);
  assert.match(vercelConfig, /"source": "\/command-center"/);
});
