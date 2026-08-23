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
let machineAreaIdForWorkflow;
let machineForWorkflow;
let machineForHermesJobId;
let STATE_VISUALS;
let CAMPER_ANIMATIONS;
let visualForState;
let normalizePublicState;
let COMMAND_CENTER_AREAS;
let COMMAND_CENTER_CANVAS;
let COMMAND_CENTER_COMPONENTS;
let COMMAND_CENTER_CONDUITS;
let COMMAND_CENTER_ENVIRONMENT;
let COMMAND_CENTER_FOREGROUND;
let COMMAND_CENTER_PROPS;
let COMMAND_CENTER_WALK_GRAPH;
let routeThroughWalkGraph;
let COMMAND_CENTER_WORKFLOW_AREAS;
let COMMAND_CENTER_MACHINES;
let CAMPER_SHEETS;
let camperSheetFor;
let camperAnimationKeyFor;
let camperFrameOrderFor;
let camperStaticFrameFor;
let camperStationaryVisualFor;
let camperWalkVisualFor;
let createCamperVisuals;
let CAMPER_VISUAL_FOR_MODE;
let PROP_SHEETS;
let PROP_STATIC;
let PROP_ANIMATED;
let propSheetFor;
let propAnchorFor;
let isAnimatedProp;
let propAnimationKeyFor;
let propFrameOrderFor;
let propStaticFrameFor;
let propsToPreload;
let queuePropArt;
let ensurePropAnimation;
let propPlaybackFor;
let replacedWhiteboxKeys;
let replacedComponentKeys;

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
    COMMAND_CENTER_ENVIRONMENT,
    COMMAND_CENTER_FOREGROUND,
    COMMAND_CENTER_PROPS,
    COMMAND_CENTER_WALK_GRAPH,
    COMMAND_CENTER_WORKFLOW_AREAS
  } = await import('../src/command-center/sceneConfig.mjs'));
  ({
    COMMAND_CENTER_MACHINES,
    areaIdForWorkflow: machineAreaIdForWorkflow,
    machineForWorkflow,
    machineForHermesJobId
  } = await import('../src/command-center/machineConfig.mjs'));
  ({
    STATE_VISUALS,
    CAMPER_ANIMATIONS,
    visualForState
  } = await import('../src/command-center/visualMappings.mjs'));
  ({ routeThroughWalkGraph } = await import('../src/command-center/walkGraph.mjs'));
  ({
    CAMPER_SHEETS,
    camperSheetFor,
    camperAnimationKeyFor,
    camperFrameOrderFor,
    camperStaticFrameFor,
    camperStationaryVisualFor,
    camperWalkVisualFor,
    createCamperVisuals,
    CAMPER_VISUAL_FOR_MODE
  } = await import('../src/command-center/camperSheets.mjs'));
  ({
    PROP_SHEETS,
    PROP_STATIC,
    PROP_ANIMATED,
    propSheetFor,
    propAnchorFor,
    isAnimatedProp,
    propAnimationKeyFor,
    propFrameOrderFor,
    propStaticFrameFor,
    propsToPreload,
    queuePropArt,
    ensurePropAnimation,
    propPlaybackFor,
    replacedWhiteboxKeys,
    replacedComponentKeys
  } = await import('../src/command-center/propSheets.mjs'));
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
  assert.equal(researchArea.displayMachine.id, 'tool-scanner');
  assert.equal(state.primaryWorkflow.machineName, 'Tool Scanner');

  const newsletterArea = state.areaGroups.find((area) => area.id === 'newsletter');
  assert.equal(newsletterArea.displayState, 'idle');
  assert.equal(newsletterArea.staleWorkflows.length, 1);
  assert.equal(stale.machineId, 'newsletter-still');

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

test('canonical command center machines map the core research lanes exactly once', () => {
  const machineIds = COMMAND_CENTER_MACHINES.map((machine) => machine.id);
  const machineNames = COMMAND_CENTER_MACHINES.map((machine) => machine.name);
  assert.equal(new Set(machineIds).size, machineIds.length, 'duplicate machine id');
  assert.equal(new Set(machineNames).size, machineNames.length, 'duplicate machine name');

  const expectedCoreLanes = new Map([
    ['ai-news', 'news-array'],
    ['github', 'repo-forge'],
    ['new-tools', 'tool-scanner'],
    ['agents', 'agent-lab'],
    ['models-infra', 'model-furnace'],
    ['creator-content', 'creator-console'],
    ['monetization', 'profit-analyzer'],
    ['playbooks', 'experiment-bench']
  ]);

  expectedCoreLanes.forEach((machineId, workflow) => {
    const machine = machineForWorkflow(workflow);
    assert.equal(machine?.id, machineId, `${workflow} canonical machine`);
    assert.equal(machineAreaIdForWorkflow(workflow), machine.areaId, `${workflow} area`);
    assert.equal(
      Object.entries(COMMAND_CENTER_WORKFLOW_AREAS).filter(([key]) => key === workflow).length,
      1,
      `${workflow} workflow area declaration`
    );
  });

  assert.equal(machineForWorkflow('newsletter').id, 'newsletter-still');
  assert.equal(machineForWorkflow('social-x').id, 'x-uplink');
  assert.equal(machineForWorkflow('terminal-publisher').id, 'publish-transmitter');
  assert.equal(machineForWorkflow('opportunity-scout'), null);
  assert.equal(machineAreaIdForWorkflow('unknown-workflow'), '');
});

test('canonical machines resolve Hermes jobs without inventing workflow telemetry', () => {
  ['newsletter', 'finisher'].forEach((jobId) => {
    assert.equal(machineForHermesJobId(jobId)?.id, 'newsletter-still', `${jobId} Hermes job`);
  });

  ['x-draft', 'x-publish', 'x-amplify'].forEach((jobId) => {
    assert.equal(machineForHermesJobId(jobId)?.id, 'x-uplink', `${jobId} Hermes job`);
  });

  assert.equal(machineForHermesJobId('Beehiiv Draft')?.id, 'publish-transmitter');
  assert.equal(machineForHermesJobId({ jobId: 'beehiiv-draft' })?.id, 'publish-transmitter');
  assert.equal(machineForHermesJobId('254525fa846f')?.id, 'opportunity-radar');
  assert.equal(machineForHermesJobId('Opportunity Scout')?.id, 'opportunity-radar');
  assert.equal(machineForWorkflow('254525fa846f'), null, 'Hermes-only job must not become a workflow lane');
});

test('machine metadata stays semantic and has no geometry or production-art fields', () => {
  const forbiddenFields = [
    'x', 'y', 'w', 'h', 'width', 'height', 'bounds', 'hitRects', 'destination',
    'color', 'accent', 'conduits', 'depth', 'art', 'textureKey', 'sheetWidth',
    'sheetHeight', 'frameWidth', 'frameHeight', 'frames', 'fps', 'repeat',
    'covers', 'coversComponents', 'originX', 'originY', 'scale'
  ];
  const propKeys = new Set(COMMAND_CENTER_PROPS.map((prop) => prop.key));

  COMMAND_CENTER_MACHINES.forEach((machine) => {
    assert.equal(Object.isFrozen(machine), true, `${machine.id} is frozen`);
    assert.equal(Object.isFrozen(machine.workflows), true, `${machine.id} workflows frozen`);
    assert.equal(Object.isFrozen(machine.hermesJobs), true, `${machine.id} jobs frozen`);
    assert.equal(Object.isFrozen(machine.propKeys), true, `${machine.id} propKeys frozen`);
    forbiddenFields.forEach((field) => {
      assert.equal(Object.hasOwn(machine, field), false, `${machine.id} must not carry ${field}`);
    });
    machine.propKeys.forEach((key) => {
      assert.equal(propKeys.has(key), true, `${machine.id} references unknown prop ${key}`);
    });
  });
});

test('Hermes job ids are assigned to only one canonical machine', () => {
  const jobIds = COMMAND_CENTER_MACHINES.flatMap((machine) => (
    machine.hermesJobs.map((hermesJob) => hermesJob.id)
  ));

  assert.equal(new Set(jobIds).size, jobIds.length, 'duplicate Hermes job id');

  COMMAND_CENTER_MACHINES.forEach((machine) => {
    machine.hermesJobs.forEach((hermesJob) => {
      assert.equal(machineForHermesJobId(hermesJob.id)?.id, machine.id, `${hermesJob.id} owner`);
    });
  });
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
  assert.equal(groups['scanner-bench'].displayMachine.name, 'Tool Scanner');
  assert.equal(groups['github-code'].displayMachine.name, 'Repo Forge');
  assert.equal(groups['x-communications'].displayMachine.name, 'X Uplink');
  assert.equal(state.activeWorkflows.length, 3);
  assert.equal(state.primaryWorkflow.workflow, 'social-x');
  assert.equal(state.primaryWorkflow.machineName, 'X Uplink');
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
    // sceneConfig is the authoritative geometry and the whitebox fallback. Real
    // art paths live in propSheets.mjs, never here — one declaration, one place.
    assert.equal(prop.art, undefined, `${prop.key} must not declare art in sceneConfig`);
    assert.equal(prop.parts.length > 0, true, `${prop.key} whitebox fallback`);
  });

  COMMAND_CENTER_COMPONENTS.forEach((component) => {
    assert.equal(inside(component.x, component.y, component.w, component.h), true, `${component.key} is outside the room`);
    // The superseded contract gave every component its own overlay PNG plus a
    // frame count. Components are now purely the procedural whitebox fallback.
    assert.equal(component.art, undefined, `${component.key} must not declare an overlay PNG`);
    assert.equal(component.frames, undefined, `${component.key} must not declare sheet frames`);
    assert.equal(typeof component.kind, 'string', `${component.key} whitebox renderer`);
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

test('command center labels prefer canonical machine names where available', () => {
  const script = fs.readFileSync(`${__dirname}/../command-center.js`, 'utf8');
  const scene = fs.readFileSync(`${__dirname}/../src/command-center/CommandCenterScene.mjs`, 'utf8');

  assert.match(script, /function workflowDisplayName\(workflow\)/);
  assert.match(script, /workflow\?\.machineName \|\| workflow\?\.workflowLabel/);
  assert.match(script, /hudTitle\.textContent = displayNameForArea\(area\)\.toUpperCase\(\)/);
  assert.match(script, /selectedTitle\.textContent = displayNameForArea\(area\)/);
  assert.match(script, /workflowDisplayName\(event\)/);
  assert.match(scene, /const machineLabel = primary\.machineName \|\| area\.shortLabel/);
  assert.match(scene, /group\.displayMachine\?\.name \|\| object\.displayWorkflow\?\.machineName/);
});

test('command center fullscreen toggle is wired to the native Fullscreen API', () => {
  const html = fs.readFileSync(`${__dirname}/../command-center.html`, 'utf8');
  const script = fs.readFileSync(`${__dirname}/../command-center.js`, 'utf8');
  const styles = fs.readFileSync(`${__dirname}/../command-center.css`, 'utf8');

  // The console box is the fullscreen target, so the toggle and the inspection
  // panel stay on screen; the button rides in the world bar with the other chrome.
  assert.match(html, /id="cc-world"/);
  assert.match(html, /<button type="button" class="cc-fullscreen mono" id="cc-fullscreen" hidden>Fullscreen<\/button>/);

  // Native API, feature-detected, with the rejection path handled.
  assert.match(script, /requestFullscreen/);
  assert.match(script, /document\.exitFullscreen/);
  assert.match(script, /document\.fullscreenEnabled/);
  assert.match(script, /Promise\.resolve\(result\)\.catch\(syncFullscreen\)/);

  // The browser is the source of truth: state is re-derived from
  // document.fullscreenElement on every change, never cached in a variable.
  assert.match(script, /addEventListener\('fullscreenchange', syncFullscreen\)/);
  assert.match(script, /document\.fullscreenElement/);
  assert.doesNotMatch(script, /(let|var)\s+(is)?[Ff]ullscreen\s*=/);

  // Fullscreen sizing is scoped to the attribute the handler writes, and the
  // single pixelated rule stays single — a second one would fight the first.
  assert.match(styles, /#cc-world\[data-fullscreen='true'\]/);
  assert.equal(styles.match(/image-rendering:\s*pixelated/g).length, 1);
});

test('command center shipped frontend contains no Star Office mutation endpoints or art references', () => {
  const frontendFiles = [
    'command-center.html',
    'command-center.js',
    'command-center.css',
    'src/command-center/CommandCenterScene.mjs',
    'src/command-center/machineConfig.mjs',
    'src/command-center/propSheets.mjs',
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

// Reads the PNG's IHDR chunk directly: 8-byte signature, then length + 'IHDR' +
// width/height as big-endian uint32. No decoding needed to prove the grid.
function readPngSize(file) {
  const buffer = fs.readFileSync(file);
  assert.equal(buffer.slice(1, 4).toString('ascii'), 'PNG', `${file} is not a PNG`);
  assert.equal(buffer.slice(12, 16).toString('ascii'), 'IHDR', `${file} has no leading IHDR`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

// IHDR byte 24 is the bit depth, byte 25 the colour type. Types 0 and 2 carry no
// alpha channel at all, so the file cannot hold transparency.
function readPngColorType(file) {
  return fs.readFileSync(file)[25];
}

test('env_floor_wall.png is the real 960x528 opaque L1 shell the scene expects', () => {
  const file = `${__dirname}/../public${COMMAND_CENTER_ENVIRONMENT.art}`;

  assert.equal(fs.existsSync(file), true, 'env_floor_wall.png is missing from public/');

  // Native full-canvas size: the art and the world share one coordinate system,
  // so the scene never has to scale, crop or reframe to fit it.
  assert.deepEqual(readPngSize(file), {
    width: COMMAND_CENTER_CANVAS.width,
    height: COMMAND_CENTER_CANVAS.height
  });

  // Section 08: this is the one file that is opaque rather than a transparent PNG.
  assert.equal(readPngColorType(file), 2, 'env_floor_wall.png must be truecolour RGB, not RGBA');
  assert.equal(
    fs.readFileSync(file).includes(Buffer.from('tRNS', 'ascii')),
    false,
    'env_floor_wall.png carries a tRNS chunk, so it is not fully opaque'
  );

  // Same naming contract the props and components are held to: one .png, no caps.
  assert.match(COMMAND_CENTER_ENVIRONMENT.art, /^\/assets\/command-center\/[a-z0-9_]+\.png$/);
  assert.equal(COMMAND_CENTER_ENVIRONMENT.key, 'env_floor_wall');
});

test('the L1 shell rides the manifest seam and renders at native scale on the env depth', () => {
  const manifest = JSON.parse(
    fs.readFileSync(`${__dirname}/../public/assets/command-center/manifest.json`, 'utf8')
  );
  assert.equal(
    manifest.files.includes(COMMAND_CENTER_ENVIRONMENT.art),
    true,
    'env_floor_wall.png is not listed, so preload would skip it'
  );

  const source = fs.readFileSync(`${__dirname}/../src/command-center/CommandCenterScene.mjs`, 'utf8');

  // Loaded through the same manifest-gated queue() every other layer uses.
  assert.match(source, /queue\(COMMAND_CENTER_ENVIRONMENT\)/);

  // addGlow legitimately calls setDisplaySize, so scope the scaling check to the
  // environment builder rather than the whole scene.
  const envBlock = source.slice(
    source.indexOf('buildEnvironment() {'),
    source.indexOf('ensureGlowTexture() {')
  );
  assert.equal(envBlock.length > 0, true, 'could not isolate buildEnvironment()');

  // Scene origin, top-left origin, native size, existing env depth constant.
  assert.match(envBlock, /this\.add\.image\(0, 0, env\.key\)\.setOrigin\(0, 0\)\.setDepth\(DEPTH\.env\)/);
  assert.doesNotMatch(envBlock, /setDisplaySize|setScale/);

  // The whitebox floor/wall shell is suppressed, never deleted.
  assert.match(envBlock, /this\.envArtLoaded = this\.textures\.exists\(env\.key\)/);
  assert.match(envBlock, /g\.fillStyle\(this\.mixColor\(env\.wallTop, env\.wallBottom/);
  assert.match(envBlock, /env\.floorMarkings\.forEach/);
  assert.match(envBlock, /env\.stencils\.forEach/);

  // Conduit channels are a separate asset pass: they stay whitebox unconditionally
  // and no conduit texture is loaded or listed yet.
  assert.match(envBlock, /const channels = this\.add\.graphics\(\)\.setDepth\(DEPTH\.env \+ 1\)/);
  assert.doesNotMatch(source, /env\.conduitArt|conduitKey/);
  assert.equal(manifest.files.some((file) => file.includes('env_conduit')), false);
  assert.equal(
    fs.existsSync(`${__dirname}/../public/assets/command-center/env_conduit_channels.png`),
    false,
    'conduit art was fabricated; that is a separate pass'
  );
});

test('the env art swap leaves station whiteboxes and the camper rig alone', () => {
  const source = fs.readFileSync(`${__dirname}/../src/command-center/CommandCenterScene.mjs`, 'utf8');

  // L2 stations keep their per-file seam: art when present, whitebox otherwise.
  assert.match(source, /prop\.parts\.forEach\(\(part\) => this\.drawWhiteboxPart\(g, prop, part\)\)/);
  assert.equal(COMMAND_CENTER_PROPS.length > 0, true);
  assert.equal(
    COMMAND_CENTER_PROPS.every((prop) => Array.isArray(prop.parts) && prop.parts.length > 0),
    true,
    'a station prop lost its whitebox parts'
  );

  // L6 foreground occluders are untouched by this pass.
  assert.match(source, /piece\.kind === 'pilaster-left' \|\| piece\.kind === 'pilaster-right'/);

  // L4 is not implicated at all: no env texture leaks into the character registry.
  const camperSource = fs.readFileSync(`${__dirname}/../src/command-center/camperSheets.mjs`, 'utf8');
  assert.doesNotMatch(camperSource, /env_floor_wall|env_conduit/);
  assert.match(source, /this\.load\.spritesheet\(sheet\.key, sheet\.art/);
});

test('every SpawnCamper sheet entry matches the real dimensions of its PNG', () => {
  const manifest = JSON.parse(
    fs.readFileSync(`${__dirname}/../public/assets/command-center/manifest.json`, 'utf8')
  );

  assert.equal(CAMPER_SHEETS.length > 0, true, 'no character sheets registered');

  CAMPER_SHEETS.forEach((sheet) => {
    // The art-swap seam: a sheet the manifest does not list stays whitebox, so
    // every registered sheet must be listed or it silently never loads.
    assert.equal(
      manifest.files.includes(sheet.art),
      true,
      `${sheet.art} is registered but missing from manifest.json`
    );

    const file = `${__dirname}/../public${sheet.art}`;
    assert.equal(fs.existsSync(file), true, `${sheet.art} listed but not on disk`);

    // The exported grid is trusted over any design-bible contract, but it has to
    // divide exactly or Phaser slices partial frames out of the sheet.
    const { width, height } = readPngSize(file);
    assert.deepEqual(
      { width, height },
      { width: sheet.sheetWidth, height: sheet.sheetHeight },
      `${sheet.art} is ${width}x${height}, registry says ${sheet.sheetWidth}x${sheet.sheetHeight}`
    );
    assert.equal(sheet.frameWidth * sheet.frames, width, `${sheet.anim} frames do not tile the sheet width`);
    assert.equal(sheet.frameHeight, height, `${sheet.anim} frame height is not the sheet height`);

    // Whatever order a sheet declares, Phaser has to be handed a valid frame
    // range: every index in bounds, each used exactly once.
    const order = camperFrameOrderFor(sheet);
    assert.equal(order.length, sheet.frames, `${sheet.anim} frame order length`);
    assert.deepEqual(
      [...order].sort((a, b) => a - b),
      Array.from({ length: sheet.frames }, (_, index) => index),
      `${sheet.anim} frame order is not a permutation of its frames`
    );
    const staticFrame = camperStaticFrameFor(sheet);
    assert.equal(
      Number.isInteger(staticFrame) && staticFrame >= 0 && staticFrame < sheet.frames,
      true,
      `${sheet.anim} reduced-motion frame is outside the sheet`
    );

    // Section 01: integer scale only, and the origin stays inside the frame.
    assert.equal(Number.isInteger(sheet.scale) && sheet.scale > 0, true, `${sheet.anim} scale must be a positive integer`);
    assert.equal(sheet.fps > 0, true, `${sheet.anim} fps`);
    assert.equal(sheet.originX >= 0 && sheet.originX <= 1, true, `${sheet.anim} originX`);
    assert.equal(sheet.originY >= 0 && sheet.originY <= 1, true, `${sheet.anim} originY`);
  });
});

test('every SpawnCamper mode resolves to a drawn sheet, falling back to idle and never to the rig', () => {
  const drawn = new Set(CAMPER_SHEETS.map((sheet) => sheet.anim));

  // Every logical telemetry mode reaches real art through the visual mapping.
  CAMPER_ANIMATIONS.forEach((mode) => {
    const visual = camperStationaryVisualFor(mode);
    assert.equal(drawn.has(visual), true, `${mode} resolved to undrawn visual ${visual}`);
    const sheet = camperSheetFor(visual);
    assert.notEqual(sheet, null, `${mode} resolved to no sheet at all`);
    assert.equal(camperAnimationKeyFor(visual), `camper_${sheet.anim}`, `${mode} animation key`);
  });

  // A visual with no art yet borrows idle's rather than reverting to the whitebox.
  assert.equal(camperStationaryVisualFor('scan_not_drawn_yet'), 'idle');
  assert.equal(camperStationaryVisualFor(undefined), 'idle');
  assert.equal(camperSheetFor('inspect').anim, 'idle', 'undrawn visual must fall back to idle art');
  assert.equal(camperAnimationKeyFor('publish_not_drawn_yet'), 'camper_idle');

  // react has no sheet yet, so it holds idle instead of the primitive rig.
  assert.equal(camperStationaryVisualFor('react'), 'idle');
});

test('SpawnCamper walk animations follow the segment being travelled, not the destination', () => {
  // positive Y / down -> front, negative Y / up -> back,
  // negative X / left -> left,  positive X / right -> right.
  assert.equal(camperWalkVisualFor(0, 120), 'walk_front');
  assert.equal(camperWalkVisualFor(0, -120), 'walk_back');
  assert.equal(camperWalkVisualFor(-120, 0), 'walk_left');
  assert.equal(camperWalkVisualFor(120, 0), 'walk_right');

  // The walk graph is axis-aligned, so a leg only ever moves on one axis; the
  // dominant axis still has to win deterministically if one ever does not.
  assert.equal(camperWalkVisualFor(90, 10), 'walk_right');
  assert.equal(camperWalkVisualFor(10, -90), 'walk_back');

  // No diagonal cel exists, so nothing may resolve outside the four walks.
  const walks = new Set(['walk_front', 'walk_back', 'walk_left', 'walk_right']);
  [[1, 1], [-1, -1], [1, -1], [-1, 1], [0, 0]].forEach(([dx, dy]) => {
    assert.equal(walks.has(camperWalkVisualFor(dx, dy)), true, `${dx},${dy}`);
  });
});

test('SpawnCamper only restarts an animation when the requested visual actually changes', () => {
  const camper = createCamperVisuals();
  camper.setMode('idle');

  camper.beginRoute();
  // Walking right across several consecutive legs is one continuous loop: only
  // the first leg reports a change, the rest are no-ops that leave it running.
  assert.equal(camper.travel(120, 0), 'walk_right');
  assert.equal(camper.travel(80, 0), null);
  assert.equal(camper.travel(4, 0), null);
  assert.equal(camper.visual, 'walk_right');

  // A route turn switches immediately, mid-route.
  assert.equal(camper.travel(0, -60), 'walk_back');
  assert.equal(camper.travel(0, -40), null);
  assert.equal(camper.visual, 'walk_back');

  // ...and back again, and to the remaining direction.
  assert.equal(camper.travel(-30, 0), 'walk_left');
  assert.equal(camper.travel(0, 30), 'walk_front');
});

test('SpawnCamper walks the whole route, then operates the workstation on arrival', () => {
  const camper = createCamperVisuals();
  camper.setMode('idle');
  assert.equal(camper.visual, 'idle');

  // right, right, up — the animation turns at the turn, not at the end.
  camper.beginRoute();
  const painted = [
    camper.travel(140, 0),
    camper.travel(60, 0),
    camper.travel(0, -90)
  ].filter(Boolean);
  assert.deepEqual(painted, ['walk_right', 'walk_back']);

  // operate_back must NOT appear while he is still moving toward the station,
  // even though the logical mode is already set.
  assert.equal(camper.setMode('operate'), null);
  assert.equal(camper.visual, 'walk_back');

  // Arrival hands the visual back to the mode.
  assert.equal(camper.endRoute('operate'), 'operate_back');
  assert.equal(camper.visual, 'operate_back');

  // Work ends and he leaves: straight into the next directional walk.
  camper.beginRoute();
  assert.equal(camper.travel(0, 120), 'walk_front');
  // ...then home to idle.
  assert.equal(camper.endRoute('idle'), 'idle');
});

test('SpawnCamper visual animation never overwrites the logical telemetry mode', () => {
  const camper = createCamperVisuals();

  // Every state's logical mode survives being rendered as operate_back.
  Object.entries(STATE_VISUALS).forEach(([state, visual]) => {
    camper.setMode(visual.camperAnim);
    assert.equal(camper.mode, visual.camperAnim, `${state} logical mode was replaced`);
    assert.equal(
      CAMPER_ANIMATIONS.includes(camper.mode),
      true,
      `${state} logical mode is not a telemetry mode`
    );
    // The inspector reads the mode, so it must never be an animation name.
    assert.equal(camper.mode.startsWith('walk_'), false, `${state} mode leaked an animation name`);
    assert.notEqual(camper.mode, 'operate_back', `${state} mode leaked an animation name`);
  });

  // Distinct logical states legitimately share one visual, and stay distinct.
  assert.equal(camperStationaryVisualFor(visualForState('newsletter').camperAnim), 'operate_back');
  assert.equal(camperStationaryVisualFor(visualForState('researching').camperAnim), 'operate_back');
  assert.equal(visualForState('newsletter').label, 'Newsletter');
  assert.equal(visualForState('researching').label, 'Research');
  assert.notEqual(visualForState('newsletter').camperAnim, undefined);

  // Machine-oriented working states all reach the workstation animation.
  [
    'researching', 'browsing', 'scanning', 'evaluating', 'thinking', 'writing', 'coding',
    'processing', 'executing', 'publishing', 'posting_to_x', 'newsletter', 'terminal_publish'
  ].forEach((state) => {
    assert.equal(
      camperStationaryVisualFor(visualForState(state).camperAnim),
      'operate_back',
      `${state} should operate the machine it walked to`
    );
  });

  // Non-working states stay off the workstation loop.
  ['idle', 'waiting', 'complete', 'warning', 'error'].forEach((state) => {
    assert.equal(camperStationaryVisualFor(visualForState(state).camperAnim), 'idle', state);
  });
});

test('the mirrored walk_right sheet is an independent texture played in its authored order', () => {
  const left = camperSheetFor('walk_left');
  const right = camperSheetFor('walk_right');

  // Loaded independently: its own key and its own file, not left's flipped.
  assert.notEqual(left.key, right.key);
  assert.notEqual(left.art, right.art);
  assert.match(right.art, /spawncamper_walk_right_sheet\.png$/);

  // The strip mirror reversed the column order, so it plays back-to-front to
  // reproduce the approved left cadence.
  assert.deepEqual(camperFrameOrderFor(right), [7, 6, 5, 4, 3, 2, 1, 0]);
  assert.deepEqual(camperFrameOrderFor(left), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(right.frames, left.frames);

  // Increasing X selects it, and no second flip is ever applied on top of a PNG
  // that is already physically mirrored.
  assert.equal(camperWalkVisualFor(120, 0), 'walk_right');
  const scene = fs.readFileSync(`${__dirname}/../src/command-center/CommandCenterScene.mjs`, 'utf8');
  assert.doesNotMatch(scene, /flipX|setFlip|toggleFlip/i);
});

test('the scene creates the camper animations it plays and sizes the hit box from the sheet', () => {
  const scene = fs.readFileSync(`${__dirname}/../src/command-center/CommandCenterScene.mjs`, 'utf8');

  // A sheet with no anims.create renders a frozen frame 0.
  assert.match(scene, /ensureCamperAnimations/);
  assert.match(scene, /this\.anims\.create\(/);
  assert.match(scene, /generateFrameNumbers\(sheet\.key/);
  // Frame sizes come from the registry, never from a hardcoded grid.
  assert.match(scene, /frameWidth: sheet\.frameWidth/);
  assert.doesNotMatch(scene, /frameWidth: 48|spawncamper_9000/);
  // Playback order is registry data too, so a back-to-front sheet needs no code.
  assert.match(scene, /camperFrameOrderFor\(sheet\)/);
  // No chroma-key / background removal anywhere: the PNG's alpha is used as authored.
  assert.doesNotMatch(scene, /chroma|greenScreen|green_screen|removeBackground|colorKey|keyOut|transparentColor/i);

  // Native pixel art: integer scale from the registry, never a forced display
  // size on the character (L5's glow image legitimately uses one).
  assert.doesNotMatch(scene, /camperBody[\s\S]{0,200}?setDisplaySize/);
  assert.match(scene, /setScale\(sheet\.scale\)/);
  assert.match(scene, /setOrigin\(sheet\.originX, sheet\.originY\)/);

  // Direction comes from the leg being travelled, and the mode is only painted
  // once the route ends — that is what keeps operate_back off him while walking.
  assert.match(scene, /setCamperTravelDirection\(leg\.x - this\.camperRig\.x, leg\.y - this\.camperRig\.y\)/);
  assert.match(scene, /this\.camperVisuals\.beginRoute\(\)/);
  assert.match(scene, /this\.camperVisuals\.endRoute\(/);

  // The inspector still reports the logical telemetry mode.
  assert.match(scene, /anim: this\.camperAnim/);

  // Reduced motion holds one frame of the requested sheet instead of looping.
  assert.match(scene, /if \(this\.reducedMotion\) \{[\s\S]{0,220}?anims\?\.stop\(\)[\s\S]{0,120}?setFrame\(camperStaticFrameFor\(sheet\)\)/);
});

test('the camper hit box covers him under every animation regardless of frame size', () => {
  const scene = fs.readFileSync(`${__dirname}/../src/command-center/CommandCenterScene.mjs`, 'utf8');

  // Sheets differ in frame size (108/110/113), so a box sized from whichever one
  // happened to be playing at build time would be wrong after a texture swap.
  assert.match(scene, /CAMPER_SHEETS\.reduce\(/);
  assert.doesNotMatch(scene, /this\.camperSheet\.frameWidth \* this\.camperSheet\.scale/);

  const widest = Math.max(...CAMPER_SHEETS.map((sheet) => sheet.frameWidth * sheet.scale));
  const tallest = Math.max(...CAMPER_SHEETS.map((sheet) => sheet.frameHeight * sheet.scale));
  CAMPER_SHEETS.forEach((sheet) => {
    assert.equal(sheet.frameWidth * sheet.scale <= widest, true, `${sheet.anim} wider than the hit box`);
    assert.equal(sheet.frameHeight * sheet.scale <= tallest, true, `${sheet.anim} taller than the hit box`);
  });

  // Bottom-centre anchoring and depth sorting are unchanged.
  assert.match(scene, /camperZone\.setPosition\(this\.camperRig\.x, this\.camperRig\.y - hitHeight \/ 2\)/);
  assert.match(scene, /\.setDepth\(DEPTH\.camper\)/);
  CAMPER_SHEETS.forEach((sheet) => {
    assert.equal(sheet.originX, 0.5, `${sheet.anim} originX`);
    assert.equal(sheet.originY, 1, `${sheet.anim} originY drifts his feet off the anchor`);
    assert.equal(sheet.scale, 1, `${sheet.anim} is not native scale`);
  });
});

test('the command center manifest lists every character sheet and no unshipped art', () => {
  const manifest = JSON.parse(
    fs.readFileSync(`${__dirname}/../public/assets/command-center/manifest.json`, 'utf8')
  );

  ['idle', 'walk_front', 'walk_back', 'walk_left', 'walk_right', 'operate_back'].forEach((anim) => {
    const sheet = CAMPER_SHEETS.find((entry) => entry.anim === anim);
    assert.notEqual(sheet, undefined, `${anim} is not in the registry`);
    assert.equal(manifest.files.includes(sheet.art), true, `${anim} missing from manifest.json`);
  });

  // Nothing is preloaded that is not really on disk: the manifest is the gate.
  manifest.files.forEach((file) => {
    assert.equal(
      fs.existsSync(`${__dirname}/../public${file}`),
      true,
      `${file} is listed but not on disk, so preload would 404`
    );
  });
});

test('the terminal page is untouched by the command center character work', () => {
  // The command center must not reach into /terminal, and /terminal must not
  // learn about SpawnCamper sheets.
  const terminalFiles = fs
    .readdirSync(`${__dirname}/../src/terminal`)
    .map((file) => `src/terminal/${file}`);
  assert.equal(terminalFiles.length > 0, true, 'no terminal sources found');

  const terminal = terminalFiles
    .filter((file) => fs.statSync(`${__dirname}/../${file}`).isFile())
    .map((file) => fs.readFileSync(`${__dirname}/../${file}`, 'utf8'))
    .join('\n');
  assert.doesNotMatch(terminal, /spawncamper|camperSheets|walk_front|operate_back/i);

  const commandCenter = [
    'src/command-center/CommandCenterScene.mjs',
    'src/command-center/camperSheets.mjs',
    'src/command-center/propSheets.mjs'
  ]
    .map((file) => fs.readFileSync(`${__dirname}/../${file}`, 'utf8'))
    .join('\n');
  assert.doesNotMatch(commandCenter, /src\/terminal|\/terminal/);
});

// ---------------------------------------------------------------------------
// Prop art registry: static prop PNG OR full animated sprite sheet, nothing else.
// ---------------------------------------------------------------------------

// A Sprite Fusion export that has not been drawn yet. Used to exercise the
// animated path end to end without fabricating a PNG on disk.
function animatedFixture(overrides = {}) {
  return {
    id: 'radar_drum',
    type: 'animated',
    art: '/assets/command-center/anim_radar_drum_sheet.png',
    textureKey: 'anim_radar_drum',
    sheetWidth: 768,
    sheetHeight: 72,
    frameWidth: 96,
    frameHeight: 72,
    frames: 8,
    fps: 12,
    repeat: -1,
    covers: ['prop_radar_drum'],
    coversComponents: ['anim_radar_sweep'],
    ...overrides
  };
}

function fakeLoader() {
  const calls = [];
  return {
    calls,
    image(key, art) { calls.push({ method: 'image', key, art }); },
    spritesheet(key, art, config) { calls.push({ method: 'spritesheet', key, art, config }); }
  };
}

function fakeAnims() {
  const created = [];
  return {
    created,
    exists(key) { return created.some((entry) => entry.key === key); },
    generateFrameNumbers(textureKey, config) { return { textureKey, ...config }; },
    create(config) { created.push(config); return config; }
  };
}

test('a static registry entry loads as a plain image, an animated one as a spritesheet', () => {
  const staticEntry = propSheetFor('ops_console');
  assert.equal(staticEntry.type, PROP_STATIC);

  const staticLoader = fakeLoader();
  queuePropArt(staticEntry, staticLoader);
  assert.deepEqual(staticLoader.calls, [{
    method: 'image',
    key: 'prop_ops_console',
    art: '/assets/command-center/prop_ops_console.png'
  }]);

  const animated = animatedFixture();
  const animLoader = fakeLoader();
  queuePropArt(animated, animLoader);
  // One call, one file. A full animated object never needs a static base loaded
  // alongside it and never needs a component overlay.
  assert.equal(animLoader.calls.length, 1);
  assert.equal(animLoader.calls[0].method, 'spritesheet');
  assert.equal(animLoader.calls[0].key, 'anim_radar_drum');
  assert.deepEqual(animLoader.calls[0].config, { frameWidth: 96, frameHeight: 72 });
});

test('an animated entry creates one valid Phaser animation and never recreates it', () => {
  const entry = animatedFixture();
  const anims = fakeAnims();

  const key = ensurePropAnimation(entry, anims);
  assert.equal(key, 'prop_radar_drum');
  assert.equal(anims.created.length, 1);
  assert.deepEqual(anims.created[0], {
    key: 'prop_radar_drum',
    frames: { textureKey: 'anim_radar_drum', frames: [0, 1, 2, 3, 4, 5, 6, 7] },
    frameRate: 12,
    repeat: -1
  });

  // The loop is registered once. Calling again — a rebuild, a second scene —
  // must not restart or duplicate it.
  ensurePropAnimation(entry, anims);
  ensurePropAnimation(entry, anims);
  assert.equal(anims.created.length, 1);

  // Static entries have no animation at all: there is no overlay layer to feed.
  assert.equal(ensurePropAnimation(propSheetFor('ops_console'), anims), '');
  assert.equal(anims.created.length, 1);

  // An export with an unusual playback order stays registry data, as with the
  // mirrored character sheet — the PNG is never edited or flipped at runtime.
  const reversed = animatedFixture({ id: 'reel', frameOrder: [3, 2, 1, 0], frames: 4 });
  assert.deepEqual(propFrameOrderFor(reversed), [3, 2, 1, 0]);
});

test('an animated machine is the whole machine: no static base, no component overlay', () => {
  const entry = animatedFixture();

  // The sheet replaces the machine's static representation outright.
  assert.equal(replacedWhiteboxKeys([entry]).has('prop_radar_drum'), true);
  // …and the whitebox sub-animation it now contains is not built either.
  assert.equal(replacedComponentKeys([entry]).has('anim_radar_sweep'), true);

  // No machine is described twice, and no entry ships a static and an animated
  // file for the same object.
  const ids = PROP_SHEETS.map((sheet) => sheet.id);
  assert.deepEqual([...new Set(ids)].length, ids.length, 'duplicate registry id');
  const covered = [];
  PROP_SHEETS.forEach((sheet) => covered.push(...sheet.covers));
  assert.deepEqual([...new Set(covered)].length, covered.length, 'two entries claim one machine');

  PROP_SHEETS.forEach((sheet) => {
    assert.equal([PROP_STATIC, PROP_ANIMATED].includes(sheet.type), true, `${sheet.id} type`);
    if (isAnimatedProp(sheet)) {
      assert.match(sheet.art, /^\/assets\/command-center\/anim_[a-z0-9_]+_sheet\.png$/, `${sheet.id} art path`);
      assert.equal(Number.isInteger(sheet.frames) && sheet.frames >= 1, true, `${sheet.id} frame count`);
      assert.equal(sheet.frameWidth * sheet.frames, sheet.sheetWidth, `${sheet.id} frames do not tile the sheet`);
      assert.equal(sheet.frameHeight, sheet.sheetHeight, `${sheet.id} frame height is not the sheet height`);
    } else {
      assert.match(sheet.art, /^\/assets\/command-center\/prop_[a-z0-9_]+\.png$/, `${sheet.id} art path`);
      // The superseded contract measured props in frames. A static PNG has none.
      assert.equal(sheet.frames, undefined, `${sheet.id} is static and must not declare frames`);
    }
  });
});

test('a real machine asset retires its whitebox body and every whitebox component it contains', () => {
  const propKeys = new Set(COMMAND_CENTER_PROPS.map((prop) => prop.key));
  const componentKeys = new Set(COMMAND_CENTER_COMPONENTS.map((component) => component.key));

  const claimedComponents = [];
  PROP_SHEETS.forEach((sheet) => {
    sheet.covers.forEach((key) => {
      assert.equal(propKeys.has(key), true, `${sheet.id} covers unknown prop ${key}`);
    });
    sheet.coversComponents.forEach((key) => {
      assert.equal(componentKeys.has(key), true, `${sheet.id} covers unknown component ${key}`);
      claimedComponents.push(key);
    });
  });

  // Static art is a complete production object too, so the whitebox screens,
  // LEDs, sweeps and coils go with it. Every component must belong to exactly
  // one machine, or a procedural overlay would survive on top of finished art.
  assert.deepEqual([...new Set(claimedComponents)].length, claimedComponents.length, 'a component is claimed twice');
  assert.deepEqual(
    [...componentKeys].filter((key) => !claimedComponents.includes(key)),
    [],
    'a whitebox component belongs to no machine and would outlive its art'
  );

  // Every machine in the room is described, whether or not its file exists yet.
  assert.deepEqual(
    [...propKeys].filter((key) => !replacedWhiteboxKeys(PROP_SHEETS).has(key)),
    []
  );
});

test('reduced motion holds a frame from the same sheet instead of needing a second PNG', () => {
  const entry = animatedFixture();

  assert.deepEqual(propPlaybackFor(entry, { reducedMotion: false }), {
    kind: 'play',
    key: 'prop_radar_drum'
  });
  // The still frame comes out of the animated sheet. No separate fallback file
  // is registered, requested or required.
  assert.deepEqual(propPlaybackFor(entry, { reducedMotion: true }), { kind: 'frame', frame: 0 });
  assert.equal(propStaticFrameFor(entry), 0);
  assert.equal(propStaticFrameFor(animatedFixture({ staticFrame: 5 })), 5);

  // Static props have no playback either way.
  assert.equal(propPlaybackFor(propSheetFor('ops_console'), { reducedMotion: false }), null);
  assert.equal(propPlaybackFor(propSheetFor('ops_console'), { reducedMotion: true }), null);

  const source = fs.readFileSync(`${__dirname}/../src/command-center/CommandCenterScene.mjs`, 'utf8');
  assert.match(source, /propPlaybackFor\(entry, \{ reducedMotion: this\.reducedMotion \}\)/);
  assert.match(source, /playback\?\.kind === 'frame'\) object\.setFrame\(playback\.frame\)/);
});

test('the prop registry rides the manifest seam and unlisted art keeps its whitebox', () => {
  const manifest = JSON.parse(
    fs.readFileSync(`${__dirname}/../public/assets/command-center/manifest.json`, 'utf8')
  );
  const listed = new Set(manifest.files);

  // Nothing is requested that the manifest does not list: an unshipped machine
  // makes zero failed requests and keeps its procedural whitebox.
  propsToPreload(listed).forEach((entry) => {
    assert.equal(listed.has(entry.art), true, `${entry.id} preloaded without being listed`);
  });
  assert.deepEqual(propsToPreload(new Set()), []);

  // One file shared by two instances is fetched once, but both instances render.
  const both = new Set(['/assets/command-center/prop_rack.png']);
  const queued = propsToPreload(both);
  assert.equal(queued.length, 1);
  assert.equal(queued[0].textureKey, 'prop_rack');
  assert.equal(PROP_SHEETS.filter((sheet) => sheet.textureKey === 'prop_rack').length, 2);

  // Every registry file the manifest does ship must exist on disk at the
  // dimensions its entry claims — measure the PNG, do not guess.
  PROP_SHEETS.forEach((sheet) => {
    if (!listed.has(sheet.art)) return;
    const file = `${__dirname}/../public${sheet.art}`;
    assert.equal(fs.existsSync(file), true, `${sheet.art} listed but not on disk`);
    if (!isAnimatedProp(sheet)) return;
    const { width, height } = readPngSize(file);
    assert.deepEqual({ width, height }, { width: sheet.sheetWidth, height: sheet.sheetHeight }, `${sheet.id} sheet size`);
  });

  // Whitebox survival is the fallback, and the scene still draws it.
  const source = fs.readFileSync(`${__dirname}/../src/command-center/CommandCenterScene.mjs`, 'utf8');
  assert.match(source, /prop\.parts\.forEach\(\(part\) => this\.drawWhiteboxPart\(g, prop, part\)\)/);
  assert.match(source, /propsToPreload\(this\.artManifest\)\.forEach\(\(entry\) => queuePropArt\(entry, this\.load\)\)/);
});

test('the retired component-overlay path is gone from the runtime', () => {
  const source = fs.readFileSync(`${__dirname}/../src/command-center/CommandCenterScene.mjs`, 'utf8');
  const config = fs.readFileSync(`${__dirname}/../src/command-center/sceneConfig.mjs`, 'utf8');

  // buildComponentParts used to early-return a flat per-component overlay image,
  // leaving `parts` half-populated and crashing the operational tweens.
  const componentBlock = source.slice(
    source.indexOf('buildComponentParts(object) {'),
    source.indexOf('startAmbient() {')
  );
  assert.equal(componentBlock.length > 0, true, 'could not isolate buildComponentParts()');
  assert.doesNotMatch(componentBlock, /textures\.exists\(spec\.key\)/);
  assert.doesNotMatch(componentBlock, /parts\.sprite/);

  // Components are no longer queued as art at all.
  assert.doesNotMatch(source, /COMMAND_CENTER_COMPONENTS\.forEach\(queue\)/);
  assert.doesNotMatch(source, /COMMAND_CENTER_PROPS\.forEach\(queue\)/);
  assert.doesNotMatch(config, /anim_[a-z_]+\.png/);
});

test('static and animated machine art render at the same prop depth, on one code path', () => {
  const source = fs.readFileSync(`${__dirname}/../src/command-center/CommandCenterScene.mjs`, 'utf8');
  const artBlock = source.slice(source.indexOf('addPropArt(entry) {'), source.indexOf('buildProps() {'));
  assert.equal(artBlock.length > 0, true, 'could not isolate addPropArt()');

  // Animating is not a reason to invent a layer: both branches land on props.
  assert.match(artBlock, /isAnimatedProp\(entry\)\s*\?\s*this\.add\.sprite\(at\.x, at\.y, entry\.textureKey\)\s*:\s*this\.add\.image\(at\.x, at\.y, entry\.textureKey\)/);
  assert.equal(artBlock.match(/setDepth\(DEPTH\.props\)/g).length, 1);
  assert.doesNotMatch(artBlock, /DEPTH\.anim|DEPTH\.fx|DEPTH\.fore/);

  // The layer order itself is untouched — no new depth was introduced.
  const depthBlock = source.slice(source.indexOf('const DEPTH = Object.freeze({'), source.indexOf("const MONO ="));
  assert.deepEqual(
    depthBlock.match(/^\s{2}([a-z]+):/gm).map((line) => line.trim().replace(':', '')),
    ['env', 'props', 'anim', 'camper', 'fx', 'fore', 'hud']
  );
});

test('a machine loop is started once at build time and never restarted on an update tick', () => {
  const source = fs.readFileSync(`${__dirname}/../src/command-center/CommandCenterScene.mjs`, 'utf8');

  const updateBlock = source.slice(source.indexOf('  update() {'), source.indexOf('  buildEnvironment() {'));
  assert.equal(updateBlock.length > 0, true, 'could not isolate update()');
  assert.doesNotMatch(updateBlock, /propObjects|addPropArt|ensurePropAnimations|\.play\(/);

  // Built once, from buildProps, and guarded by anims.exists inside the registry.
  assert.equal(source.match(/this\.ensurePropAnimations\(\)/g).length, 1);
  assert.equal(source.match(/live\.forEach\(\(entry\) => this\.addPropArt\(entry\)\)/g).length, 1);
});

test('the prop registry holds no coordinates: sceneConfig geometry stays authoritative', () => {
  PROP_SHEETS.forEach((sheet) => {
    assert.equal(sheet.x, undefined, `${sheet.id} must not duplicate machine x`);
    assert.equal(sheet.y, undefined, `${sheet.id} must not duplicate machine y`);
  });

  // The anchor is derived from the whitebox box: bottom-centre, like the camper,
  // so an export larger than the whitebox keeps the same floor contact point.
  const box = COMMAND_CENTER_PROPS.find((prop) => prop.key === 'prop_radar_drum');
  assert.deepEqual(propAnchorFor(animatedFixture(), box), {
    x: box.x + box.w / 2,
    y: box.y + box.h,
    originX: 0.5,
    originY: 1,
    scale: 1
  });

  // Overrides exist for an awkward Sprite Fusion export, and only for that.
  assert.deepEqual(propAnchorFor(animatedFixture({ offsetX: -4, offsetY: 6, scale: 2 }), box), {
    x: box.x + box.w / 2 - 4,
    y: box.y + box.h + 6,
    originX: 0.5,
    originY: 1,
    scale: 2
  });

  const source = fs.readFileSync(`${__dirname}/../src/command-center/CommandCenterScene.mjs`, 'utf8');
  assert.match(source, /COMMAND_CENTER_PROPS\.find\(\(prop\) => prop\.key === entry\.covers\[0\]\)/);
});

test('foreground occlusion stays independent of the prop art registry', () => {
  // L6 is depth, not animation: its own art paths, its own loader seam, its own
  // layer above the character. It was never part of the retired overlay system.
  assert.equal(COMMAND_CENTER_FOREGROUND.length > 0, true);
  COMMAND_CENTER_FOREGROUND.forEach((piece) => {
    assert.match(piece.art, /^\/assets\/command-center\/fore_[a-z0-9_]+\.png$/, `${piece.key} art path`);
  });

  const foreKeys = new Set(COMMAND_CENTER_FOREGROUND.map((piece) => piece.key));
  PROP_SHEETS.forEach((sheet) => {
    sheet.covers.concat(sheet.coversComponents).forEach((key) => {
      assert.equal(foreKeys.has(key), false, `${sheet.id} must not swallow occluder ${key}`);
    });
    assert.doesNotMatch(sheet.art, /fore_/, `${sheet.id} art path`);
  });

  const source = fs.readFileSync(`${__dirname}/../src/command-center/CommandCenterScene.mjs`, 'utf8');
  assert.match(source, /COMMAND_CENTER_FOREGROUND\.forEach\(queue\)/);
  assert.match(source, /this\.add\.image\(piece\.x, piece\.y, piece\.key\)\.setOrigin\(0, 0\)\.setDepth\(DEPTH\.fore\)/);
});

test('the prop art registry leaves the SpawnCamper systems alone', () => {
  const propSource = fs.readFileSync(`${__dirname}/../src/command-center/propSheets.mjs`, 'utf8');
  assert.doesNotMatch(propSource, /spawncamper|camper|walk_front|operate_back/i);
  assert.doesNotMatch(propSource, /Hermes|hermesJobs|workflow|COMMAND_CENTER_MACHINES|machineConfig/i);

  // The character keeps its own registry, its own keys and its own animations.
  const camperKeys = new Set(CAMPER_SHEETS.map((sheet) => sheet.key));
  PROP_SHEETS.forEach((sheet) => {
    assert.equal(camperKeys.has(sheet.textureKey), false, `${sheet.id} collides with a character sheet`);
    assert.notEqual(propAnimationKeyFor(sheet), camperAnimationKeyFor('idle'));
  });

  const source = fs.readFileSync(`${__dirname}/../src/command-center/CommandCenterScene.mjs`, 'utf8');
  assert.match(source, /this\.load\.spritesheet\(sheet\.key, sheet\.art/);
  assert.match(source, /ensureCamperAnimations\(\)/);
  assert.match(source, /setOrigin\(sheet\.originX, sheet\.originY\)/);
});
