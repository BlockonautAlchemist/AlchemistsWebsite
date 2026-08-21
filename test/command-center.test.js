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
let areaIdForWorkflow;
let canonicalAreaId;
let STATE_VISUALS;
let CAMPER_ANIMATIONS;
let visualForState;
let normalizePublicState;
let COMMAND_CENTER_AREAS;
let COMMAND_CENTER_CANVAS;
let COMMAND_CENTER_COMPONENTS;
let COMMAND_CENTER_CONDUITS;
let COMMAND_CENTER_PROPS;
let COMMAND_CENTER_WALK_GRAPH;
let routeThroughWalkGraph;
let COMMAND_CENTER_WORKFLOW_AREAS;

test.before(async () => {
  ({
    fallbackCommandCenterState,
    normalizePublicState
  } = await import('../src/command-center/stateModel.mjs'));
  ({
    areaIdForWorkflow,
    canonicalAreaId,
    COMMAND_CENTER_AREAS,
    COMMAND_CENTER_CANVAS,
    COMMAND_CENTER_COMPONENTS,
    COMMAND_CENTER_CONDUITS,
    COMMAND_CENTER_PROPS,
    COMMAND_CENTER_WALK_GRAPH,
    COMMAND_CENTER_WORKFLOW_AREAS
  } = await import('../src/command-center/sceneConfig.mjs'));
  ({
    STATE_VISUALS,
    CAMPER_ANIMATIONS,
    visualForState
  } = await import('../src/command-center/visualMappings.mjs'));
  ({ routeThroughWalkGraph } = await import('../src/command-center/walkGraph.mjs'));
});

test.afterEach(() => {
  _setSqlForTests(null);

  if (originalIngestSecret === undefined) delete process.env.COMMAND_CENTER_INGEST_SECRET;
  else process.env.COMMAND_CENTER_INGEST_SECRET = originalIngestSecret;

  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
});

function sampleTelemetry(overrides = {}, now = Date.now()) {
  return {
    eventId: 'event-1',
    agent: 'spawncamper9000',
    workflow: 'new-tools',
    workflowLabel: 'New Tools',
    state: 'researching',
    activity: 'Scanning AI gaming tools',
    timestamp: new Date(now - 1000).toISOString(),
    startedAt: new Date(now - 1000).toISOString(),
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
    () => validateTelemetryPayload(sampleTelemetry({ rawLog: 'do not ingest' }, now), { now }),
    /unsupported fields/
  );
  assert.throws(
    () => validateTelemetryPayload(sampleTelemetry({ state: 'drafting' }, now), { now }),
    /state is not allowed/
  );
  assert.throws(
    () => validateTelemetryPayload(sampleTelemetry({ publicUrl: 'https://token@example.com/post' }, now), { now }),
    /embedded credentials/
  );
  assert.throws(
    () => validateTelemetryPayload(sampleTelemetry({ context: { station: 'scanner', secret: 'x' } }, now), { now }),
    /context includes unsupported fields/
  );
  assert.throws(
    () => validateTelemetryPayload(sampleTelemetry({ timestamp: '2026-08-20T20:20:00Z' }, now), { now }),
    /future/
  );
  assert.throws(
    () => validateTelemetryPayload(sampleTelemetry({ ttlSeconds: 10 }, now), { now }),
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
  assert.equal(state.primaryWorkflow.areaId, 'scanner-bench');
  const stale = state.workflows.find((workflow) => workflow.workflow === 'newsletter');
  assert.equal(stale.isStale, true);
  assert.equal(stale.displayState, 'idle');
  assert.equal(stale.areaId, 'newsletter');
  assert.equal(stale.stationId, 'newsletter');
  assert.equal(state.staleCount, 1);

  const researchArea = state.areaGroups.find((area) => area.id === 'scanner-bench');
  assert.equal(researchArea.displayState, 'researching');
  assert.equal(researchArea.activeWorkflows.length, 1);

  const newsletterArea = state.areaGroups.find((area) => area.id === 'newsletter');
  assert.equal(newsletterArea.displayState, 'idle');
  assert.equal(newsletterArea.staleWorkflows.length, 1);

  const fallback = fallbackCommandCenterState({ message: 'database unavailable', now });
  assert.equal(fallback.overallStatus, 'offline');
  assert.equal(fallback.message, 'database unavailable');
  assert.equal(fallback.areaGroups.length > 0, true);
});

test('maps workflows and context aliases to command center room areas', () => {
  const workflowCases = [
    ['ai-news', 'intelligence-research'],
    ['new-tools', 'scanner-bench'],
    ['agents', 'scanner-bench'],
    ['creator-content', 'intelligence-research'],
    ['monetization', 'intelligence-research'],
    ['playbooks', 'scanner-bench'],
    ['github', 'github-code'],
    ['models-infra', 'model-infrastructure'],
    ['newsletter', 'newsletter'],
    ['social-x', 'x-communications'],
    ['terminal-publisher', 'terminal-transmitter'],
    ['unknown-workflow', 'central-operations']
  ];

  workflowCases.forEach(([workflow, areaId]) => {
    assert.equal(areaIdForWorkflow({ workflow, context: {} }), areaId);
  });

  assert.equal(areaIdForWorkflow({ workflow: 'unknown', context: { station: 'scanner' } }), 'scanner-bench');
  assert.equal(areaIdForWorkflow({ workflow: 'unknown', context: { station: 'creator' } }), 'intelligence-research');
  assert.equal(areaIdForWorkflow({ workflow: 'unknown', context: { station: 'models' } }), 'model-infrastructure');
  assert.equal(areaIdForWorkflow({ workflow: 'unknown', context: { station: 'social-x' } }), 'x-communications');
  assert.equal(areaIdForWorkflow({ workflow: 'unknown', context: { station: 'terminal-publisher' } }), 'terminal-transmitter');
  assert.equal(canonicalAreaId('central-operations'), 'central-operations');
});

test('selects command center focus by attention, transmission, active, then fresh complete', () => {
  const now = Date.parse('2026-08-20T20:10:00.000Z');
  const workflow = (overrides) => ({
    agent: 'spawncamper9000',
    workflow: 'new-tools',
    workflowLabel: 'New Tools',
    state: 'researching',
    activity: 'Working',
    timestamp: '2026-08-20T20:09:00.000Z',
    ttlSeconds: 900,
    expiresAt: '2026-08-20T20:24:00.000Z',
    context: {},
    ...overrides
  });

  let state = normalizePublicState({
    success: true,
    fetchedAt: '2026-08-20T20:10:00.000Z',
    workflows: [
      workflow({
        workflow: 'github',
        workflowLabel: 'GitHub',
        state: 'error',
        timestamp: '2026-08-20T20:08:00.000Z'
      }),
      workflow({
        workflow: 'newsletter',
        workflowLabel: 'Newsletter',
        state: 'newsletter',
        timestamp: '2026-08-20T20:09:30.000Z'
      })
    ]
  }, now);
  assert.equal(state.primaryWorkflow.workflow, 'github');
  assert.equal(state.primaryWorkflow.displayState, 'error');

  state = normalizePublicState({
    success: true,
    fetchedAt: '2026-08-20T20:10:00.000Z',
    workflows: [
      workflow({
        workflow: 'terminal-publisher',
        workflowLabel: 'Terminal Publisher',
        state: 'terminal_publish',
        timestamp: '2026-08-20T20:07:00.000Z'
      }),
      workflow({
        workflow: 'github',
        workflowLabel: 'GitHub',
        state: 'coding',
        timestamp: '2026-08-20T20:09:30.000Z'
      })
    ]
  }, now);
  assert.equal(state.primaryWorkflow.workflow, 'terminal-publisher');
  assert.equal(state.primaryWorkflow.areaId, 'terminal-transmitter');

  state = normalizePublicState({
    success: true,
    fetchedAt: '2026-08-20T20:10:00.000Z',
    workflows: [
      workflow({
        workflow: 'new-tools',
        workflowLabel: 'New Tools',
        state: 'researching',
        timestamp: '2026-08-20T20:08:00.000Z'
      }),
      workflow({
        workflow: 'models-infra',
        workflowLabel: 'Models Infra',
        state: 'processing',
        timestamp: '2026-08-20T20:09:00.000Z'
      })
    ]
  }, now);
  assert.equal(state.primaryWorkflow.workflow, 'models-infra');
  assert.equal(state.primaryWorkflow.areaId, 'model-infrastructure');

  state = normalizePublicState({
    success: true,
    fetchedAt: '2026-08-20T20:10:00.000Z',
    workflows: [
      workflow({
        workflow: 'new-tools',
        workflowLabel: 'New Tools',
        state: 'complete',
        timestamp: '2026-08-20T20:09:45.000Z'
      })
    ]
  }, now);
  assert.equal(state.primaryWorkflow.workflow, 'new-tools');
  assert.equal(state.primaryWorkflow.displayState, 'complete');
  assert.equal(state.overallStatus, 'complete');

  state = normalizePublicState({
    success: true,
    fetchedAt: '2026-08-20T20:10:00.000Z',
    workflows: [
      workflow({
        workflow: 'new-tools',
        workflowLabel: 'New Tools',
        state: 'complete',
        timestamp: '2026-08-20T20:08:45.000Z'
      })
    ]
  }, now);
  assert.equal(state.primaryWorkflow, null);
  assert.equal(state.workflows[0].displayState, 'idle');
  assert.equal(state.overallStatus, 'idle');
});

test('groups simultaneous workflows by independently animated room areas', () => {
  const now = Date.parse('2026-08-20T20:10:00.000Z');
  const state = normalizePublicState({
    success: true,
    fetchedAt: '2026-08-20T20:10:00.000Z',
    workflows: [
      {
        workflow: 'new-tools',
        workflowLabel: 'New Tools',
        state: 'scanning',
        activity: 'Scanning tools',
        timestamp: '2026-08-20T20:09:00.000Z',
        ttlSeconds: 900,
        expiresAt: '2026-08-20T20:24:00.000Z',
        context: { station: 'scanner' }
      },
      {
        workflow: 'github',
        workflowLabel: 'GitHub',
        state: 'coding',
        activity: 'Reviewing repositories',
        timestamp: '2026-08-20T20:09:10.000Z',
        ttlSeconds: 900,
        expiresAt: '2026-08-20T20:24:10.000Z',
        context: { station: 'github' }
      },
      {
        workflow: 'social-x',
        workflowLabel: 'X Highlights',
        state: 'posting_to_x',
        activity: 'Posting highlights',
        timestamp: '2026-08-20T20:08:00.000Z',
        ttlSeconds: 900,
        expiresAt: '2026-08-20T20:23:00.000Z',
        context: { station: 'social-x' }
      }
    ]
  }, now);

  const groups = Object.fromEntries(state.areaGroups.map((area) => [area.id, area]));
  assert.equal(groups['scanner-bench'].displayState, 'scanning');
  assert.equal(groups['github-code'].displayState, 'coding');
  assert.equal(groups['x-communications'].displayState, 'posting_to_x');
  assert.equal(state.activeWorkflows.length, 3);
  assert.equal(state.primaryWorkflow.workflow, 'social-x');
});

test('uses generalized SpawnCamper modes instead of human walking animation names', () => {
  const modes = Object.values(STATE_VISUALS).map((visual) => visual.agentMode);
  assert.equal(modes.some((mode) => mode.startsWith('walk_')), false);
  assert.equal(visualForState('coding').agentMode, 'interact');
  assert.equal(visualForState('terminal_publish').agentMode, 'transmit');
  assert.equal(visualForState('complete').agentMode, 'complete');
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

test('command center scene geometry matches the locked design grid', () => {
  assert.equal(COMMAND_CENTER_CANVAS.width, 960);
  assert.equal(COMMAND_CENTER_CANVAS.height, 528);
  assert.equal(COMMAND_CENTER_CANVAS.tileSize, 24);
  assert.equal(COMMAND_CENTER_CANVAS.gridCols * COMMAND_CENTER_CANVAS.tileSize, COMMAND_CENTER_CANVAS.width);
  assert.equal(COMMAND_CENTER_CANVAS.gridRows * COMMAND_CENTER_CANVAS.tileSize, COMMAND_CENTER_CANVAS.height);

  const inside = (x, y, w, h) => x >= 0 && y >= 0 && x + w <= COMMAND_CENTER_CANVAS.width && y + h <= COMMAND_CENTER_CANVAS.height;

  COMMAND_CENTER_PROPS.forEach((prop) => {
    assert.equal(inside(prop.x, prop.y, prop.w, prop.h), true, `${prop.key} is outside the room`);
    // Section 08 swap seam: every prop names the pixel art that will replace it and
    // carries a whitebox to draw until that file exists.
    assert.match(prop.art, /^\/assets\/command-center\/[a-z0-9_]+\.png$/, `${prop.key} art path`);
    assert.equal(prop.parts.length > 0, true, `${prop.key} whitebox fallback`);
  });

  COMMAND_CENTER_COMPONENTS.forEach((component) => {
    assert.equal(inside(component.x, component.y, component.w, component.h), true, `${component.key} is outside the room`);
    assert.match(component.art, /^\/assets\/command-center\/[a-z0-9_]+\.png$/, `${component.key} art path`);
    assert.equal(component.frames >= 1, true, `${component.key} frame count`);
    // Rule 2: anything that changes with telemetry lives in L3, never baked into L1/L2.
    assert.equal(COMMAND_CENTER_PROPS.some((prop) => prop.key === component.key), false);
  });
});

test('every command center zone anchor sits south of its machine', () => {
  COMMAND_CENTER_AREAS.forEach((area) => {
    const body = area.hitRects[0];
    assert.equal(
      area.destination.y >= body.y + body.height,
      true,
      `${area.id} anchor must be south of its body so one operate animation serves it`
    );
    assert.equal(area.destination.x >= 0 && area.destination.x <= COMMAND_CENTER_CANVAS.width, true);
    assert.equal(typeof area.zoneNumber, 'string');
  });

  // Every zone that a workflow can land in must be reachable and inspectable.
  const zoneIds = new Set(COMMAND_CENTER_AREAS.map((area) => area.id));
  Object.values(COMMAND_CENTER_WORKFLOW_AREAS).forEach((areaId) => {
    assert.equal(zoneIds.has(areaId), true, `${areaId} is mapped but has no zone`);
  });
});

test('the command center walk graph has no diagonal travel', () => {
  COMMAND_CENTER_WALK_GRAPH.segments.forEach((segment) => {
    const axisAligned = segment.from.x === segment.to.x || segment.from.y === segment.to.y;
    assert.equal(axisAligned, true, `${segment.id} must be axis-aligned`);
  });

  // Every anchor is reachable from the idle anchor without a diagonal leg.
  COMMAND_CENTER_AREAS.forEach((area) => {
    const path = routeThroughWalkGraph(COMMAND_CENTER_CANVAS.homePoint, area.destination);
    for (let i = 1; i < path.length; i += 1) {
      const diagonal = path[i].x !== path[i - 1].x && path[i].y !== path[i - 1].y;
      assert.equal(diagonal, false, `route to ${area.id} turned diagonally`);
    }
    const last = path[path.length - 1];
    assert.deepEqual({ x: last.x, y: last.y }, { x: area.destination.x, y: area.destination.y });
  });
});

test('every telemetry state maps onto a SpawnCamper sheet row and real conduits', () => {
  const conduitIds = new Set(COMMAND_CENTER_CONDUITS.map((conduit) => conduit.id));
  const componentKeys = new Set(COMMAND_CENTER_COMPONENTS.map((component) => component.key));

  Object.entries(STATE_VISUALS).forEach(([state, visual]) => {
    assert.equal(CAMPER_ANIMATIONS.includes(visual.camperAnim), true, `${state} camperAnim`);
    visual.conduits.forEach((id) => assert.equal(conduitIds.has(id), true, `${state} references conduit ${id}`));
    visual.components.forEach((key) => assert.equal(componentKeys.has(key), true, `${state} references component ${key}`));
    assert.equal(visual.rate > 0, true, `${state} loop rate`);
  });

  // Section 04: warning and stale slow the owning machine to 60%; they never
  // recolour or pause the rest of the room.
  assert.equal(STATE_VISUALS.warning.rate, 0.6);
  assert.equal(STATE_VISUALS.warning.components.length, 0);
  assert.equal(STATE_VISUALS.error.components.length, 0);
  assert.equal(visualForState('posting_to_x').conduits.includes('D5'), true);
  assert.equal(visualForState('terminal_publish').conduits.includes('D8'), true);
});

test('command center page is wired as a public read-only route', () => {
  const html = fs.readFileSync(`${__dirname}/../command-center.html`, 'utf8');
  const script = fs.readFileSync(`${__dirname}/../command-center.js`, 'utf8');
  const styles = fs.readFileSync(`${__dirname}/../command-center.css`, 'utf8');
  const scene = fs.readFileSync(`${__dirname}/../src/command-center/CommandCenterScene.mjs`, 'utf8');
  const sceneConfig = fs.readFileSync(`${__dirname}/../src/command-center/sceneConfig.mjs`, 'utf8');
  const index = fs.readFileSync(`${__dirname}/../index.html`, 'utf8');
  const viteConfig = fs.readFileSync(`${__dirname}/../vite.config.js`, 'utf8');
  const vercelConfig = fs.readFileSync(`${__dirname}/../vercel.json`, 'utf8');

  assert.match(html, /id="cc-canvas"/);
  assert.match(html, /data-readonly="true"/);
  assert.match(html, /id="cc-area-body"/);
  assert.match(html, /id="cc-recent-list"/);
  assert.match(html, /src="command-center\.js"/);
  assert.doesNotMatch(html, /method="post"/i);
  assert.doesNotMatch(html, /cc-ops|cc-workflow-list|cc-refresh|Refresh command center state/i);
  assert.doesNotMatch(script, /cc-refresh|Refresh command center state|\/set_state|\/status|\/agents|join-agent|agent-push|yesterday-memo|config\/gemini/i);
  assert.doesNotMatch(styles, /\.cc-ops|\.cc-refresh|\.cc-workflows/);
  assert.match(script, /import\('phaser'\)/);
  // Section 02 layer decomposition + the single section 11 telemetry seam.
  assert.match(scene, /buildEnvironment/);
  assert.match(scene, /buildProps/);
  assert.match(scene, /buildComponents/);
  assert.match(scene, /buildCamper/);
  assert.match(scene, /buildForeground/);
  assert.match(scene, /applyZoneState/);
  assert.match(scene, /emitCompleteFlash/);
  assert.match(scene, /inspectArea/);
  assert.match(sceneConfig, /central-operations/);
  assert.match(sceneConfig, /terminal-transmitter/);
  assert.doesNotMatch(sceneConfig, /cc-background|cc-station|office_bg|star-idle|sofa|guest_anim|LimeZu/i);
  assert.doesNotMatch(html, /cc-refresh|Refresh command center state/i);
  assert.match(index, /href="\/command-center"/);
  assert.match(viteConfig, /commandCenter/);
  assert.match(vercelConfig, /"source": "\/command-center"/);
});

test('command center shipped frontend contains no Star Office mutation endpoints or art references', () => {
  const frontendFiles = [
    'command-center.html',
    'command-center.js',
    'command-center.css',
    'src/command-center/CommandCenterScene.mjs',
    'src/command-center/sceneConfig.mjs',
    'src/command-center/stateModel.mjs',
    'src/command-center/telemetryClient.mjs',
    'src/command-center/visualMappings.mjs',
    'src/command-center/walkGraph.mjs',
    'public/assets/command-center/manifest.json'
  ];
  const combined = frontendFiles
    .map((file) => fs.readFileSync(`${__dirname}/../${file}`, 'utf8'))
    .join('\n');

  assert.doesNotMatch(combined, /\/set_state|\/status|\/agents|\/join-agent|\/agent-push|\/leave-agent|\/yesterday-memo|\/config\/gemini|\/assets\/generate-rpg-background/i);
  assert.doesNotMatch(combined, /office_bg|star-idle|star_working|sofa|coffee_machine|serverroom|error_bug|guest_anim|button skins|LimeZu/i);
});
