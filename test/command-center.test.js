const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const zlib = require('node:zlib');

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

// The whitebox is the development fallback for art that has not arrived, so a
// prop is entitled to skip it only once its art really ships. Exactly one has:
// the wall sigil, whose whitebox was a dark 52x52 slab with a `Russo One` "A"
// stroked over it, standing in for a glyph nobody had drawn. The emblem PNG is
// now a finished transparent export, and a plate behind transparent art is not a
// fallback — it is a plate behind the art.
//
// Deliberately an allowlist rather than a rule like "shipped props may drop their
// parts": the Ops Console ships art too and keeps its whitebox desk, and nothing
// else in the room may lose its fallback by accident. Adding a key here is a
// decision, not a side effect.
const WHITEBOXLESS_PROPS = new Set(['prop_wall_sigil']);

let fallbackCommandCenterState;
let COMMAND_CENTER_STATES;
let areaIdForWorkflow;
let canonicalAreaId;
let machineAreaIdForWorkflow;
let machineForWorkflow;
let machineForHermesJobId;
let machineById;
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
let pointOnSegment;
let walkNodes;
let COMMAND_CENTER_WORKFLOW_AREAS;
let COMMAND_CENTER_STATE_AREAS;
let areaIdForState;
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
let propShadowFor;
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
    COMMAND_CENTER_STATES,
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
    COMMAND_CENTER_STATE_AREAS,
    COMMAND_CENTER_WORKFLOW_AREAS
  } = await import('../src/command-center/sceneConfig.mjs'));
  ({
    COMMAND_CENTER_MACHINES,
    areaIdForState,
    areaIdForWorkflow: machineAreaIdForWorkflow,
    machineForWorkflow,
    machineForHermesJobId,
    machineById
  } = await import('../src/command-center/machineConfig.mjs'));
  ({
    STATE_VISUALS,
    CAMPER_ANIMATIONS,
    visualForState
  } = await import('../src/command-center/visualMappings.mjs'));
  ({ routeThroughWalkGraph, pointOnSegment, walkNodes } = await import('../src/command-center/walkGraph.mjs'));
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
    propShadowFor,
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
    ['agents', 'agent-lab'],
    ['creator-content', 'creator-console'],
    ['monetization', 'profit-analyzer'],
    ['playbooks', 'experiment-bench'],
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
  assert.equal(areaIdForWorkflow({ workflow: 'unknown', context: { station: 'creator' } }), 'creator-console');
  assert.equal(areaIdForWorkflow({ workflow: 'unknown', context: { station: 'models' } }), 'model-infrastructure');
  assert.equal(areaIdForWorkflow({ workflow: 'unknown', context: { station: 'social-x' } }), 'x-communications');
  assert.equal(areaIdForWorkflow({ workflow: 'unknown', context: { station: 'terminal-publisher' } }), 'terminal-transmitter');
  assert.equal(canonicalAreaId('central-operations'), 'central-operations');
});

test('every activity state maps to a real workstation with a reachable anchor', () => {
  const zonesById = new Map(COMMAND_CENTER_AREAS.map((area) => [area.id, area]));

  Object.entries(COMMAND_CENTER_STATE_AREAS).forEach(([state, areaId]) => {
    assert.equal(
      COMMAND_CENTER_STATES.includes(state),
      true,
      `${state} is mapped to a workstation but is not a telemetry state`
    );

    const zone = zonesById.get(areaId);
    assert.notEqual(zone, undefined, `${state} maps to unknown zone ${areaId}`);
    assert.equal(areaIdForState(state), areaId, `${state} lookup`);

    // He has to be able to walk there, on lanes, without a diagonal leg.
    const path = routeThroughWalkGraph(COMMAND_CENTER_CANVAS.homePoint, zone.destination);
    path.slice(1).forEach((point, index) => {
      const previous = path[index];
      assert.equal(
        point.x !== previous.x && point.y !== previous.y,
        false,
        `route to ${areaId} for ${state} turned diagonally`
      );
    });
    assert.deepEqual(
      path[path.length - 1],
      zone.destination,
      `route to ${areaId} for ${state} does not end on its anchor`
    );
  });

  // The five states that name no activity name no workstation either, which is what
  // sends a finishing or faulting job back to its own machine instead of a bench.
  ['idle', 'waiting', 'complete', 'warning', 'error'].forEach((state) => {
    assert.equal(areaIdForState(state), '', `${state} must not claim a workstation`);
  });
  assert.equal(areaIdForState('not-a-state'), '');
  assert.equal(areaIdForState(undefined), '');
});

test('activity state outranks the owning machine, and context.station outranks both', () => {
  // The production path: one Hermes job, no context.station, walking the room.
  assert.equal(areaIdForWorkflow({ workflow: 'ai-news', state: 'researching' }), 'intelligence-research');
  assert.equal(areaIdForWorkflow({ workflow: 'ai-news', state: 'evaluating' }), 'profit-analyzer');
  assert.equal(areaIdForWorkflow({ workflow: 'ai-news', state: 'writing' }), 'creator-console');
  assert.equal(areaIdForWorkflow({ workflow: 'ai-news', state: 'newsletter' }), 'newsletter');
  assert.equal(areaIdForWorkflow({ workflow: 'ai-news', state: 'terminal_publish' }), 'terminal-transmitter');

  // States with no workstation of their own fall through to the owning machine, so
  // the job finishes and faults where it belongs.
  assert.equal(areaIdForWorkflow({ workflow: 'ai-news', state: 'complete' }), 'intelligence-research');
  assert.equal(areaIdForWorkflow({ workflow: 'ai-news', state: 'waiting' }), 'intelligence-research');
  assert.equal(areaIdForWorkflow({ workflow: 'github', state: 'error' }), 'github-code');
  assert.equal(areaIdForWorkflow({ workflow: 'github', state: 'idle' }), 'github-code');
  assert.equal(areaIdForWorkflow({ workflow: 'unknown-workflow', state: 'complete' }), 'central-operations');

  // The optional explicit override still wins over both.
  assert.equal(
    areaIdForWorkflow({ workflow: 'ai-news', state: 'writing', context: { station: 'scanner' } }),
    'scanner-bench'
  );
  assert.equal(
    areaIdForWorkflow({ workflow: 'ai-news', state: 'researching', context: { station: 'terminal-publisher' } }),
    'terminal-transmitter'
  );
  // An unrecognised station is not an override, so the activity still decides.
  assert.equal(
    areaIdForWorkflow({ workflow: 'ai-news', state: 'coding', context: { station: 'nowhere' } }),
    'github-code'
  );
});

test('one hermes job walks the room as its activity state changes', () => {
  const now = Date.parse('2025-03-04T12:00:00.000Z');
  const stateAt = (state, offsetSeconds) => normalizePublicState({
    success: true,
    fetchedAt: new Date(now).toISOString(),
    workflows: [{
      agent: 'spawncamper9000',
      workflow: 'ai-news',
      workflowLabel: 'AI News',
      state,
      activity: `Hermes is ${state}`,
      timestamp: new Date(now - offsetSeconds * 1000).toISOString(),
      ttlSeconds: 900,
      context: {}
    }]
  }, now);
  const at = (state, offsetSeconds) => stateAt(state, offsetSeconds).primaryWorkflow;

  // Same workflow, same machine owner, five different destinations.
  assert.equal(at('researching', 5).areaId, 'intelligence-research');
  assert.equal(at('evaluating', 5).areaId, 'profit-analyzer');
  assert.equal(at('writing', 5).areaId, 'creator-console');
  assert.equal(at('terminal_publish', 5).areaId, 'terminal-transmitter');
  assert.equal(at('writing', 5).machineId, 'news-array', 'the owning machine is unchanged');
  assert.equal(at('writing', 5).stationId, at('writing', 5).areaId);

  // The complete acknowledgement finishes at the machine that owns the job.
  const complete = at('complete', 5);
  assert.equal(complete.displayState, 'complete');
  assert.equal(complete.areaId, 'intelligence-research');

  // And once the acknowledgement expires he is released: nothing left to focus on,
  // so the scene walks him home to central operations and idles.
  const settled = stateAt('complete', 120);
  assert.equal(settled.primaryWorkflow, null);
  assert.equal(settled.workflows[0].displayState, 'idle');
  assert.equal(settled.workflows[0].areaId, 'intelligence-research');
  assert.equal(settled.workflows[0].isVisible, false);

  // A stale mid-activity entry reads as idle, so it stops pinning him to a bench.
  const stale = normalizePublicState({
    success: true,
    workflows: [{
      workflow: 'ai-news',
      state: 'writing',
      activity: 'Drafting the brief',
      timestamp: new Date(now - 3600 * 1000).toISOString(),
      ttlSeconds: 900,
      isStale: true,
      context: {}
    }]
  }, now).workflows[0];
  assert.equal(stale.displayState, 'idle');
  assert.equal(stale.areaId, 'intelligence-research');
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
    // Every prop keeps a whitebox fallback except the wall sigil, which is
    // finished transparent art and has nothing to fall back to — see
    // WHITEBOXLESS_PROPS at the top of this file.
    if (WHITEBOXLESS_PROPS.has(prop.key)) return;
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

// Fully decodes an RGBA8 sprite strip and reports the opaque bounding box of its
// frames, in frame-local coordinates and unioned across every frame. This is what
// makes the two art-derived registry numbers checkable: `offsetY` is the empty
// rows under the machine, and `shadowWidth` is how wide the machine really is —
// neither is visible in IHDR, and eyeballing them is how they drift.
function readPngOpaqueBounds(file, frameWidth, frameHeight) {
  const buffer = fs.readFileSync(file);
  assert.equal(buffer[24], 8, `${file} is not 8-bit`);
  assert.equal(buffer[25], 6, `${file} is not RGBA`);
  assert.equal(buffer[28], 0, `${file} is interlaced`);

  const { width, height } = readPngSize(file);
  const idat = [];
  let pos = 8;
  while (pos < buffer.length) {
    const length = buffer.readUInt32BE(pos);
    const type = buffer.toString('ascii', pos + 4, pos + 8);
    if (type === 'IDAT') idat.push(buffer.subarray(pos + 8, pos + 8 + length));
    if (type === 'IEND') break;
    pos += 12 + length;
  }

  // Undo the per-scanline filters; only the alpha byte of each pixel is read
  // afterwards, but every channel has to be reconstructed to get to it.
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      let value = line[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = value & 0xff;
    }
  }

  // The alpha census rides along on the same decode. Pixel art on this seam is
  // hard-edged: a file that reports semi-transparent pixels has been resized or
  // re-encoded with smoothing on, which reads as a soft halo against the wall.
  const frames = Math.round(width / frameWidth);
  const bounds = { minX: frameWidth, maxX: -1, minY: frameHeight, maxY: -1 };
  const alpha = { opaque: 0, semiTransparent: 0, transparent: 0 };
  for (let frame = 0; frame < frames; frame += 1) {
    for (let y = 0; y < frameHeight; y += 1) {
      for (let x = 0; x < frameWidth; x += 1) {
        const value = out[y * stride + (frame * frameWidth + x) * bpp + 3];
        if (value === 0) alpha.transparent += 1;
        else if (value === 255) alpha.opaque += 1;
        else alpha.semiTransparent += 1;
        if (value === 0) continue;
        bounds.minX = Math.min(bounds.minX, x);
        bounds.maxX = Math.max(bounds.maxX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.maxY = Math.max(bounds.maxY, y);
      }
    }
  }
  return {
    width: bounds.maxX - bounds.minX + 1,
    height: bounds.maxY - bounds.minY + 1,
    centreX: (bounds.minX + bounds.maxX + 1) / 2,
    bottomSlack: frameHeight - 1 - bounds.maxY,
    alpha
  };
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
    COMMAND_CENTER_PROPS.every((prop) => (
      Array.isArray(prop.parts) && (prop.parts.length > 0 || WHITEBOXLESS_PROPS.has(prop.key))
    )),
    true,
    'a station prop lost its whitebox parts'
  );

  // L6 has no procedural renderer left to disturb: it draws a real texture or
  // nothing, so nothing in this pass can paint a flat strip over the env art.
  const foreBlockEnv = source.slice(
    source.indexOf('buildForeground() {'),
    source.indexOf('// Floor vignette and scanline overlay')
  );
  assert.equal(foreBlockEnv.length > 0, true, 'could not isolate buildForeground()');
  assert.doesNotMatch(foreBlockEnv, /piece\.kind/);

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
  // that is already physically mirrored. Machine art *may* be mirrored — that is
  // a registry knob — so the guard is that the scene's only flip is the
  // registry-driven one on prop art, and that nothing in the character build
  // path flips at all.
  assert.equal(camperWalkVisualFor(120, 0), 'walk_right');
  const scene = fs.readFileSync(`${__dirname}/../src/command-center/CommandCenterScene.mjs`, 'utf8');
  const flips = (scene.match(/^.*(?:flipX|setFlip|toggleFlip).*$/gim) || []).map((line) => line.trim());
  assert.deepEqual(flips, ['if (entry.flipX) object.setFlipX(true);']);

  const camperSection = scene.slice(scene.indexOf('buildCamper() {'));
  assert.notEqual(camperSection, '');
  assert.doesNotMatch(camperSection, /flipX|setFlip|toggleFlip/i);
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

test('an unattended machine and reduced motion both hold a frame from the same sheet', () => {
  const entry = animatedFixture();

  // A machine runs only while it is being worked at. `active` is the grant, and
  // it is off by default: asking without it is asking for the still frame.
  assert.deepEqual(propPlaybackFor(entry, { active: true }), {
    kind: 'play',
    key: 'prop_radar_drum'
  });
  assert.deepEqual(propPlaybackFor(entry, { active: false }), { kind: 'frame', frame: 0 });
  assert.deepEqual(propPlaybackFor(entry, {}), { kind: 'frame', frame: 0 });
  assert.deepEqual(propPlaybackFor(entry), { kind: 'frame', frame: 0 });

  // Reduced motion outranks attendance: the machine he is standing at still
  // holds its frame. Both still frames come out of the animated sheet, so no
  // separate fallback file is registered, requested or required.
  assert.deepEqual(propPlaybackFor(entry, { reducedMotion: true, active: true }), { kind: 'frame', frame: 0 });
  assert.deepEqual(propPlaybackFor(entry, { reducedMotion: true, active: false }), { kind: 'frame', frame: 0 });
  assert.equal(propStaticFrameFor(entry), 0);
  assert.equal(propStaticFrameFor(animatedFixture({ staticFrame: 5 })), 5);
  assert.deepEqual(
    propPlaybackFor(animatedFixture({ staticFrame: 5 }), { active: false }),
    { kind: 'frame', frame: 5 }
  );

  // Static props have no playback under any combination.
  assert.equal(propPlaybackFor(propSheetFor('ops_console'), { active: true }), null);
  assert.equal(propPlaybackFor(propSheetFor('ops_console'), { active: false }), null);
  assert.equal(propPlaybackFor(propSheetFor('ops_console'), { reducedMotion: true }), null);

  const source = fs.readFileSync(`${__dirname}/../src/command-center/CommandCenterScene.mjs`, 'utf8');
  // Built still, and woken only from the station seam.
  assert.match(source, /propPlaybackFor\(entry, \{ reducedMotion: this\.reducedMotion, active: false \}\)/);
  assert.match(source, /propPlaybackFor\(entry, \{ reducedMotion: this\.reducedMotion, active \}\)/);
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

  // No entry shares a texture with another any more. The racks demonstrated the
  // one-file-two-instances shape first, the Model Furnace sheet swallowed both,
  // the wide crates inherited it, and the cleanup pass deleted the crates. The
  // dedup guard in propsToPreload stays — it is loader hygiene, not a crate
  // special case — but there is nothing left in the registry for it to collapse,
  // so the invariant to hold now is that every texture key is unique.
  const textureKeys = PROP_SHEETS.map((sheet) => sheet.textureKey);
  assert.equal(new Set(textureKeys).size, textureKeys.length, 'two entries share a texture key');

  // A single-file manifest still queues exactly one entry, and only that one.
  const one = new Set(['/assets/command-center/prop_ops_console.png']);
  const queued = propsToPreload(one);
  assert.equal(queued.length, 1);
  assert.equal(queued[0].textureKey, 'prop_ops_console');

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

test('machines build still, and playback is only ever issued from the station seam', () => {
  const source = fs.readFileSync(`${__dirname}/../src/command-center/CommandCenterScene.mjs`, 'utf8');

  // Machine playback is not a per-frame concern: it changes when attendance
  // changes, never on a tick.
  const updateBlock = source.slice(source.indexOf('  update() {'), source.indexOf('  buildEnvironment() {'));
  assert.equal(updateBlock.length > 0, true, 'could not isolate update()');
  assert.doesNotMatch(updateBlock, /propObjects|propArtByZone|addPropArt|ensurePropAnimations|setCamperStation|\.play\(/);

  // Built once, from buildProps, and guarded by anims.exists inside the registry.
  assert.equal(source.match(/this\.ensurePropAnimations\(\)/g).length, 1);
  assert.equal(source.match(/live\.forEach\(\(entry\) => this\.addPropArt\(entry\)\)/g).length, 1);

  // The build pass is explicitly inactive: no machine is running when the room
  // first paints, however busy telemetry is.
  const artBlock = source.slice(source.indexOf('  addPropArt(entry) {'), source.indexOf('  setZonePropArtActive('));
  assert.equal(artBlock.length > 0, true, 'could not isolate addPropArt()');
  assert.match(artBlock, /propPlaybackFor\(entry, \{ reducedMotion: this\.reducedMotion, active: false \}\)/);
  assert.doesNotMatch(artBlock, /active: true/);

  // And exactly one function after build time may start or stop a machine.
  const playCalls = source.match(/\bobject\.play\(playback\.key, true\)/g) || [];
  assert.equal(playCalls.length, 2, 'machine playback issued outside build + station seam');
  const stationBlock = source.slice(
    source.indexOf('  setZonePropArtActive('),
    source.indexOf('  setCamperStation(')
  );
  assert.match(stationBlock, /propPlaybackFor\(entry, \{ reducedMotion: this\.reducedMotion, active \}\)/);
  // Freezing stops the loop rather than leaving it paused on an arbitrary frame.
  assert.match(stationBlock, /object\.anims\?\.stop\(\);\s*\n\s*object\.setFrame\(playback\.frame\)/);
});

test('every animated machine resolves to a real zone SpawnCamper can walk to', () => {
  // This is the whole join the station seam runs on, and it carries no new data:
  // the sheet names the whitebox body it covers, and the body already knows its
  // zone. A machine whose anchor lost its zone would silently never wake.
  const areaIds = new Set(COMMAND_CENTER_AREAS.map((area) => area.id));
  const animated = PROP_SHEETS.filter(isAnimatedProp);
  assert.equal(animated.length, 12, 'the shipped animated machine count changed');

  animated.forEach((entry) => {
    const box = COMMAND_CENTER_PROPS.find((prop) => prop.key === entry.covers[0]);
    assert.ok(box, `${entry.id} anchors on a prop that does not exist`);
    assert.equal(areaIds.has(box.zone), true, `${entry.id} anchors in unknown zone ${box.zone}`);

    // The zone the art physically stands in is the zone the semantic registry
    // sends him to. If these two ever drift he walks to one place and a machine
    // somewhere else lights up.
    const owners = COMMAND_CENTER_MACHINES.filter((machine) => (
      machine.propKeys.some((key) => entry.covers.includes(key))
    ));
    assert.ok(owners.length > 0, `${entry.id} is owned by no machine`);
    owners.forEach((machine) => {
      assert.equal(machine.areaId, box.zone, `${machine.id} areaId disagrees with ${entry.id} art zone`);
    });

    // And he can actually get there, or the machine is unreachable by design.
    const area = COMMAND_CENTER_AREAS.find((candidate) => candidate.id === box.zone);
    const route = routeThroughWalkGraph(COMMAND_CENTER_CANVAS.homePoint, area.destination);
    assert.ok(route.length > 0, `${box.zone} is unreachable from home`);
  });
});

test('only the machine SpawnCamper stands at runs; every other one holds frame 0', () => {
  // The scene's index, rebuilt from the same two facts it uses.
  const byZone = new Map();
  PROP_SHEETS.filter(isAnimatedProp).forEach((entry) => {
    const box = COMMAND_CENTER_PROPS.find((prop) => prop.key === entry.covers[0]);
    const list = byZone.get(box.zone) || [];
    list.push(entry);
    byZone.set(box.zone, list);
  });

  // Given one attended zone, what the whole room does.
  const room = (stationZoneId, { reducedMotion = false } = {}) => {
    const running = [];
    byZone.forEach((entries, zoneId) => {
      entries.forEach((entry) => {
        const playback = propPlaybackFor(entry, { reducedMotion, active: stationZoneId === zoneId });
        if (playback.kind === 'play') running.push(entry.id);
        else assert.equal(playback.frame, propStaticFrameFor(entry), `${entry.id} froze on the wrong frame`);
      });
    });
    return running.sort();
  };

  // Nothing attended — first paint, and walking home — is a completely still room.
  assert.deepEqual(room(''), []);

  // Standing at one zone runs that zone's machines and strictly nothing else,
  // however many other workflows telemetry says are live.
  assert.deepEqual(room('github-code'), ['code_bench']);
  assert.deepEqual(room('model-infrastructure'), ['furnace_chamber']);
  assert.deepEqual(room('newsletter'), ['still_column']);
  assert.deepEqual(room('terminal-transmitter'), ['tx_body']);
  assert.deepEqual(room('profit-analyzer'), ['profit_analyzer']);

  // Zone 02 is the one zone that owns two finished machines — News Array on the
  // wall and the Opportunity Radar on the floor below it — and standing there
  // wakes both. Attendance is per zone, not per machine, and always was; the
  // News Array sheet is simply the first delivery that makes that visible.
  assert.deepEqual(room('intelligence-research'), ['radar_drum', 'wall_feed_shells']);

  // Every zone that owns art wakes exactly its own art, one zone at a time.
  byZone.forEach((entries, zoneId) => {
    assert.deepEqual(room(zoneId), entries.map((entry) => entry.id).sort(), `${zoneId} station`);
  });

  // Zone 09 used to be the Power Core: a zone with no machine, no art and nothing
  // to wake. The Experiment Bench took that pocket, so standing there now runs it.
  assert.deepEqual(room('experiment-bench'), ['experiment_bench']);

  // A zone with no art of its own leaves the room still rather than throwing.
  assert.deepEqual(room('central-operations'), []);

  // Reduced motion outranks attendance everywhere.
  byZone.forEach((entries, zoneId) => {
    assert.deepEqual(room(zoneId, { reducedMotion: true }), [], `${zoneId} moved under reduced motion`);
  });
});

test('arriving at a machine is what starts it, and leaving is what stops it', () => {
  const source = fs.readFileSync(`${__dirname}/../src/command-center/CommandCenterScene.mjs`, 'utf8');
  const moveBlock = source.slice(
    source.indexOf('  moveCamperTo(point, {'),
    source.indexOf('  // -------------------------------------------------------------------------\n  // L5 · conduits')
  );
  assert.equal(moveBlock.length > 0, true, 'could not isolate moveCamperTo()');

  // He gives the machine up when a walk actually begins, so nothing is running
  // while he travels and nothing he passes on the way wakes up.
  assert.equal((moveBlock.match(/this\.setCamperStation\(''\);/g) || []).length, 1);
  assert.equal(
    moveBlock.indexOf("this.setCamperStation('')") < moveBlock.indexOf('this.camperVisuals.beginRoute()'),
    true,
    'the station is released after the route starts'
  );

  // Crucially it is released *after* the early returns, not at the top of the
  // function: telemetry re-polls while he stands at one machine, and releasing
  // first would stop and restart that machine on every tick. Standing still
  // through an update must be a no-op, which setCamperStation's identity guard
  // only delivers if the release never runs in that path.
  assert.equal(
    moveBlock.indexOf('if (immediate || this.reducedMotion)') < moveBlock.indexOf("this.setCamperStation('')"),
    true,
    'the immediate branch is reached before the station is released'
  );
  assert.equal(
    moveBlock.indexOf('// Already standing there.') < moveBlock.indexOf("this.setCamperStation('')"),
    true,
    'the already-standing-there branch is reached before the station is released'
  );

  // And every way a route can finish stations him: the walked arrival, the
  // immediate snap, the already-standing-there case and the zero-leg route.
  assert.equal((moveBlock.match(/this\.setCamperStation\(this\.pendingCamperZoneId\)/g) || []).length, 4);

  // The walked arrival stations him only after the whole leg timeline is spent.
  const arrival = moveBlock.slice(moveBlock.indexOf('if (index >= timeline.length) {'));
  assert.match(arrival, /playCamperAnimation\(this\.pendingCamperAnim \|\| 'idle'\);\s*\n(\s*\/\/.*\n)*\s*this\.setCamperStation\(this\.pendingCamperZoneId\);/);

  // Telemetry chooses the destination; the pose decides whether it counts as
  // work. Idling at a machine — or at home — stations nowhere.
  const updateBlock = source.slice(
    source.indexOf('  updatePublicState(state) {'),
    source.indexOf('  applyAreaGroups(areaGroups) {')
  );
  assert.equal(updateBlock.length > 0, true, 'could not isolate updatePublicState()');
  assert.match(updateBlock, /this\.pendingCamperZoneId = visual\.camperAnim === 'idle' \? '' : primary\.areaId;/);
  assert.match(updateBlock, /this\.pendingCamperZoneId = '';/);

  // Every state that maps to an idle pose therefore leaves the room still.
  const idleStates = Object.entries(STATE_VISUALS)
    .filter(([, visual]) => visual.camperAnim === 'idle')
    .map(([state]) => state);
  assert.deepEqual(idleStates.sort(), ['complete', 'idle', 'waiting']);
});

test('the whitebox fallback is gated on attendance, but the status readouts are not', () => {
  const source = fs.readFileSync(`${__dirname}/../src/command-center/CommandCenterScene.mjs`, 'utf8');
  const zoneBlock = source.slice(
    source.indexOf('  applyZoneState(zoneId, group) {'),
    source.indexOf('  componentsForArea(zoneId) {')
  );
  assert.equal(zoneBlock.length > 0, true, 'could not isolate applyZoneState()');

  // A machine still on the whitebox fallback behaves exactly like one with
  // finished art: its sweeps, scan bars, coils and fans run only where he stands.
  assert.match(zoneBlock, /const attended = this\.camperStationZoneId === zoneId;/);
  assert.match(zoneBlock, /const nextKeys = attended \? new Set\(visual\.components\) : new Set\(\);/);

  // Everything below the component gate reports state and must keep doing so
  // regardless of where he is standing, or an unattended zone reads as offline
  // rather than merely quiet.
  const readouts = zoneBlock.slice(zoneBlock.indexOf('// Conduits belonging to this zone'));
  assert.doesNotMatch(readouts, /attended|camperStationZoneId/);
  ['setConduitActive', 'setLocalGlow', 'setWarningLamp', 'setGlitch', 'emitCompleteFlash'].forEach((call) => {
    assert.match(readouts, new RegExp(`this\\.${call}\\(`), `${call} left the ungated readout block`);
  });

  // Changing where he stands re-evaluates both zones off the last telemetry
  // rather than inventing a second state path.
  const stationBlock = source.slice(
    source.indexOf('  setCamperStation(zoneId) {'),
    source.indexOf('  addPropShadow(entry) {')
  );
  assert.equal(stationBlock.length > 0, true, 'could not isolate setCamperStation()');
  assert.match(stationBlock, /if \(next === this\.camperStationZoneId\) return;/);
  assert.match(stationBlock, /this\.applyAreaGroups\(this\.latestState\.areaGroups \|\| \[\]\)/);
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
  const foreKeys = new Set(COMMAND_CENTER_FOREGROUND.map((piece) => piece.key));
  assert.deepEqual([...foreKeys], []);

  // Every machine-specific lip is retired. A lip existed to hide the camper's
  // legs behind a whitebox desk; a finished machine draws its own front, so a
  // surviving lip only paints a flat block over real art. `fore_ops_console_front`
  // was the last one, retired with the Ops Console art — SpawnCamper stands in
  // that console's throne opening and the 192x14 bar at (384,204) cut his shins
  // in half while erasing the console's own plinth and feet.
  //
  // The three structural pieces went the same way once L1 shipped: the pilasters
  // and the wall port never had a PNG either, and env_floor_wall.png draws the
  // wall edges and cable port they stood in for. Same rule, one layer down.
  [
    'fore_code_bench_front',
    'fore_furnace_lip',
    'fore_ops_console_front',
    'fore_still_base',
    'fore_tx_front',
    'fore_x_console_front',
    'fore_pilaster_l',
    'fore_pilaster_r',
    'fore_wall_port'
  ].forEach((key) => {
    assert.equal(foreKeys.has(key), false, `${key} should no longer render as foreground`);
  });

  // What is left is structural, and each piece carries its own procedural
  // renderer. There is no generic flat-rect fallback left in the scene: it only
  // ever served the lips, and an untextured occluder over finished art is a
  // block, not an occluder.
  COMMAND_CENTER_FOREGROUND.forEach((piece) => {
    assert.equal(typeof piece.kind, 'string', `${piece.key} has no foreground renderer`);
  });
  COMMAND_CENTER_FOREGROUND.forEach((piece) => {
    assert.match(piece.art, /^\/assets\/command-center\/fore_[a-z0-9_]+\.png$/, `${piece.key} art path`);
  });

  PROP_SHEETS.forEach((sheet) => {
    sheet.covers.concat(sheet.coversComponents).forEach((key) => {
      assert.equal(foreKeys.has(key), false, `${sheet.id} must not swallow occluder ${key}`);
    });
    assert.doesNotMatch(sheet.art, /fore_/, `${sheet.id} art path`);
  });

  const source = fs.readFileSync(`${__dirname}/../src/command-center/CommandCenterScene.mjs`, 'utf8');
  assert.match(source, /COMMAND_CENTER_FOREGROUND\.forEach\(queue\)/);
  assert.match(source, /this\.add\.image\(piece\.x, piece\.y, piece\.key\)\.setOrigin\(0, 0\)\.setDepth\(DEPTH\.fore\)/);

  // The generic fallback really is gone from buildForeground, so nothing can
  // flat-fill a rect above the character any more.
  const foreBlock = source.slice(
    source.indexOf('buildForeground() {'),
    source.indexOf('// Floor vignette and scanline overlay')
  );
  assert.equal(foreBlock.length > 0, true, 'could not isolate buildForeground()');
  assert.doesNotMatch(foreBlock, /0x20092c/);
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

// ---------------------------------------------------------------------------
// The twelve machine sheets that actually ship today (section 08 art passes 1-5).
// ---------------------------------------------------------------------------

// Measured off the real PNGs, not copied from a design contract: each file was
// decoded and its alpha walked per frame. All twelve are one horizontal strip of
// cells, zero margin, zero spacing, binary alpha. The invariant that holds is
// `frameHeight == sheetHeight`, not squareness: the Repo Forge cell is 203x202,
// the Model Furnace cell 202x203 and the Publish Transmitter cell 149x144.
//
// `offsetY` is the only *positional* override any of them carries, and nine do:
// each of those cells leaves empty rows under the machine's contact edge, so
// without the nudge it hangs that far off its box. Alongside it sit two more
// measured facts — `shadowWidth`, how wide the art really is, which sizes the
// generated contact shadow, and `flipX` on the two machines that were exported
// facing the wrong way. Everything else stays derived from sceneConfig.
//
// News Array and Agent Lab are the wall-mounted sheets, so they carry
// `groundShadow: false` and no `shadowWidth` at all: they stand on nothing and
// cast no floor pool.
const SHIPPED_MACHINE_SHEETS = [
  {
    id: 'radar_drum',
    machine: 'Opportunity Radar',
    art: '/assets/command-center/anim_opportunity_radar_sheet.png',
    textureKey: 'anim_opportunity_radar',
    sheetWidth: 544, sheetHeight: 68, frameWidth: 68, frameHeight: 68, frames: 8, fps: 8,
    anchorProp: 'prop_radar_drum',
    shadowWidth: 54
  },
  {
    id: 'scanner_bench',
    machine: 'Tool Scanner',
    art: '/assets/command-center/anim_tool_scanner_sheet.png',
    textureKey: 'anim_tool_scanner',
    sheetWidth: 576, sheetHeight: 72, frameWidth: 72, frameHeight: 72, frames: 8, fps: 6,
    anchorProp: 'prop_scanner_bench',
    shadowWidth: 68
  },
  {
    id: 'still_column',
    machine: 'Newsletter Still',
    art: '/assets/command-center/anim_newsletter_still_sheet.png',
    textureKey: 'anim_newsletter_still',
    sheetWidth: 1624, sheetHeight: 203, frameWidth: 203, frameHeight: 203, frames: 8, fps: 6,
    anchorProp: 'prop_still_column',
    // Measured bottom slack: content ends at frame y=181 of a 203px cell.
    offsetY: 21,
    shadowWidth: 98
  },
  {
    id: 'x_console',
    machine: 'X Uplink',
    art: '/assets/command-center/anim_x_uplink_sheet.png',
    textureKey: 'anim_x_uplink',
    sheetWidth: 512, sheetHeight: 64, frameWidth: 64, frameHeight: 64, frames: 8, fps: 6,
    anchorProp: 'prop_x_console',
    shadowWidth: 60
  },
  {
    id: 'creator_console',
    machine: 'Creator Console',
    art: '/assets/command-center/anim_creator_console_sheet.png',
    textureKey: 'anim_creator_console',
    sheetWidth: 1320, sheetHeight: 151, frameWidth: 165, frameHeight: 151, frames: 8, fps: 6,
    anchorProp: 'prop_creator_console',
    // Measured bottom slack: content ends at frame y=128 of a 151px cell.
    offsetY: 22,
    shadowWidth: 123,
    flipX: true
  },
  {
    id: 'code_bench',
    machine: 'Repo Forge',
    art: '/assets/command-center/anim_repo_forge_sheet.png',
    textureKey: 'anim_repo_forge',
    sheetWidth: 1624, sheetHeight: 202, frameWidth: 203, frameHeight: 202, frames: 8, fps: 6,
    anchorProp: 'prop_code_bench',
    // Measured bottom slack: content ends at frame y=172 of a 202px cell.
    offsetY: 29,
    shadowWidth: 163,
    flipX: true
  },
  {
    id: 'furnace_chamber',
    machine: 'Model Furnace',
    art: '/assets/command-center/anim_model_furnace_sheet.png',
    textureKey: 'anim_model_furnace',
    sheetWidth: 1616, sheetHeight: 203, frameWidth: 202, frameHeight: 203, frames: 8, fps: 6,
    anchorProp: 'prop_furnace_chamber',
    // Measured bottom slack: content ends at frame y=161 of a 203px cell.
    offsetY: 41,
    shadowWidth: 165
  },
  {
    id: 'profit_analyzer',
    machine: 'Profit Analyzer',
    art: '/assets/command-center/anim_profit_analyzer_sheet.png',
    textureKey: 'anim_profit_analyzer',
    sheetWidth: 1576, sheetHeight: 197, frameWidth: 197, frameHeight: 197, frames: 8, fps: 6,
    anchorProp: 'prop_profit_analyzer',
    // Measured bottom slack: content ends at frame y=177 of a 197px cell.
    offsetY: 19,
    shadowWidth: 133
  },
  {
    id: 'tx_body',
    machine: 'Publish Transmitter',
    art: '/assets/command-center/anim_publish_transmitter_sheet.png',
    textureKey: 'anim_publish_transmitter',
    sheetWidth: 1192, sheetHeight: 144, frameWidth: 149, frameHeight: 144, frames: 8, fps: 6,
    anchorProp: 'prop_tx_body',
    // Measured bottom slack: content ends at frame y=111 of a 144px cell.
    offsetY: 32,
    shadowWidth: 85
  },
  {
    id: 'experiment_bench',
    machine: 'Experiment Bench',
    art: '/assets/command-center/anim_experiment_bench_sheet.png',
    textureKey: 'anim_experiment_bench',
    sheetWidth: 1624, sheetHeight: 203, frameWidth: 203, frameHeight: 203, frames: 8, fps: 6,
    anchorProp: 'prop_experiment_bench',
    // Measured bottom slack: content ends at frame y=145 of a 203px cell.
    offsetY: 57,
    shadowWidth: 127
  },
  {
    id: 'wall_feed_shells',
    machine: 'News Array',
    art: '/assets/command-center/anim_news_array_sheet.png',
    textureKey: 'anim_news_array',
    sheetWidth: 1608, sheetHeight: 204, frameWidth: 201, frameHeight: 204, frames: 8, fps: 6,
    anchorProp: 'prop_wall_feed_shells',
    // Measured bottom slack: content ends at frame y=133 of a 204px cell. The
    // contact edge here is the wall strip's bottom edge, not a floor line.
    offsetY: 70,
    // Wall-mounted: stands on nothing, so it records no art width and casts no
    // floor pool. Every floor-standing shipped sheet does both.
    groundShadow: false
  },
  {
    id: 'wall_agent_lab',
    machine: 'Agent Lab',
    art: '/assets/command-center/anim_agent_lab_sheet.png',
    textureKey: 'anim_agent_lab',
    sheetWidth: 1624, sheetHeight: 202, frameWidth: 203, frameHeight: 202, frames: 8, fps: 6,
    anchorProp: 'prop_wall_agent_lab',
    // Measured bottom slack: the cabinet ends at frame y=181 of a 202px cell.
    // The contact edge is the box's bottom edge on the wall, not a floor line.
    offsetY: 20,
    // The room's second wall-mounted sheet, and the second entry to opt out of a
    // floor pool. Like News Array it records no art width, because nothing sizes
    // a shadow it never draws.
    groundShadow: false
  }
];


// The shipped STATIC props, measured the same way and held to the same contract.
// A finished machine does not have to move: the Ops Console PNG is the entire
// console — both wing desks, the throne seat, the overhead arch and every lit
// readout — so it retires its whitebox body and all three of its procedural
// components exactly the way a sheet does, and carries the same measured numbers
// off the same real pixels.
//
// The wall sigil is the second, and it proves the floor is not part of the
// contract either: it is wall art, so it opts out of the pool with
// `groundShadow: false` and records no `shadowWidth`, exactly as the News Array
// and Agent Lab *sheets* do. Static versus animated and floor versus wall are two
// independent axes, and this table now covers one prop in each corner it needs.
//
// `readPngOpaqueBounds` is reused verbatim: passing the file's own dimensions as
// the cell resolves to a single frame, and the bottom slack it reports is the
// same number `offsetY` has to be.
const SHIPPED_STATIC_PROPS = [
  {
    id: 'ops_console',
    machine: 'Ops Console',
    art: '/assets/command-center/prop_ops_console.png',
    textureKey: 'prop_ops_console',
    fileWidth: 201, fileHeight: 203,
    anchorProp: 'prop_ops_console',
    coversComponents: ['anim_ops_desk_screens', 'anim_keyboard_leds', 'anim_ops_caret'],
    // Measured content: 168x104 at x 16-183, y 49-152 of a 201x203 file.
    offsetY: 50,
    shadowWidth: 168
  },
  {
    id: 'wall_sigil',
    machine: 'Wall Sigil',
    art: '/assets/command-center/prop_wall_sigil.png',
    textureKey: 'prop_wall_sigil',
    fileWidth: 64, fileHeight: 64,
    anchorProp: 'prop_wall_sigil',
    coversComponents: [],
    // Measured content: 47x62 at x 8-54, y 1-62 of a 64x64 file, so exactly one
    // empty row under the glyph. Centred at x31.5 against a cell centre of 32 —
    // 0.5px, right on the tolerance, which is why it needs no offsetX.
    offsetY: 1,
    // Bolted to the wall, so no pool and deliberately no shadowWidth: an unread
    // number is a number that drifts.
    groundShadow: false
  }
];

test('the shipped static props are held to the animated sheets\' contract', () => {
  SHIPPED_STATIC_PROPS.forEach((expected) => {
    const entry = propSheetFor(expected.id);
    assert.notEqual(entry, null, `${expected.machine} is not in the prop registry`);

    // Static means static: a plain image, no frames, no loop, no held frame.
    assert.equal(entry.type, PROP_STATIC, `${expected.machine} is not a static entry`);
    assert.equal(isAnimatedProp(entry), false, `${expected.machine} resolves as animated`);
    assert.equal(entry.frames, undefined, `${expected.machine} must not declare frames`);
    assert.equal(entry.fps, undefined, `${expected.machine} must not declare fps`);
    assert.equal(propAnimationKeyFor(entry), `prop_${expected.id}`);
    assert.equal(ensurePropAnimation(entry, fakeAnims()), '', `${expected.machine} registered a loop`);
    [{ active: true }, { active: false }, { reducedMotion: true }, { reducedMotion: true, active: true }]
      .forEach((options) => {
        assert.equal(propPlaybackFor(entry, options), null, `${expected.machine} has playback`);
      });

    assert.equal(entry.art, expected.art, `${expected.machine} art path`);
    assert.equal(entry.textureKey, expected.textureKey, `${expected.machine} texture key`);
    assert.equal(entry.covers[0], expected.anchorProp, `${expected.machine} anchor prop`);
    assert.deepEqual([...entry.coversComponents], expected.coversComponents, `${expected.machine} components`);

    // Same override budget the sheets get: measured numbers only. No rescale, no
    // re-origin, no sideways nudge, and a static prop never mirrors.
    assert.equal(entry.scale, undefined, `${expected.machine} must not override scale`);
    assert.equal(entry.offsetX, undefined, `${expected.machine} must not override offsetX`);
    assert.equal(entry.originX, undefined, `${expected.machine} must not override originX`);
    assert.equal(entry.originY, undefined, `${expected.machine} must not override originY`);
    assert.equal(entry.flipX, undefined, `${expected.machine} must not flip`);
    assert.equal(entry.x, undefined, `${expected.machine} must not carry an x`);
    assert.equal(entry.y, undefined, `${expected.machine} must not carry a y`);

    // The file really is what the registry was measured against.
    const file = `${__dirname}/../public${entry.art}`;
    assert.equal(fs.existsSync(file), true, `${expected.art} is missing from public/`);
    assert.deepEqual(
      readPngSize(file),
      { width: expected.fileWidth, height: expected.fileHeight },
      `${expected.art} is not ${expected.fileWidth}x${expected.fileHeight}`
    );
    assert.equal(readPngColorType(file), 6, `${expected.art} must be truecolour RGBA`);

    // And the art-derived numbers are the real pixels, not an eyeballed guess: a
    // drifted export fails here instead of rendering subtly wrong.
    const measured = readPngOpaqueBounds(file, expected.fileWidth, expected.fileHeight);
    assert.equal(entry.offsetY, measured.bottomSlack, `${expected.machine} offsetY is not its measured bottom slack`);
    assert.equal(entry.offsetY, expected.offsetY, `${expected.machine} offsetY`);

    // Wall art records no width because it draws no pool — the same branch the
    // animated sheets take for the News Array and the Agent Lab.
    if (expected.groundShadow === false) {
      assert.equal(entry.groundShadow, false, `${expected.machine} is wall art but pools on the floor`);
      assert.equal(entry.shadowWidth, undefined, `${expected.machine} is wall art and must record no shadowWidth`);
    } else {
      assert.equal(entry.shadowWidth, measured.width, `${expected.machine} shadowWidth is not the art's real width`);
      assert.equal(entry.shadowWidth, expected.shadowWidth, `${expected.machine} shadowWidth`);
    }

    // Centred in its cell to within the same 0.5px the mirrored sheets are held
    // to, which is why it needs no origin override.
    assert.ok(
      Math.abs(measured.centreX - expected.fileWidth / 2) <= 0.5,
      `${expected.machine} art is off its cell centre`
    );

    // Anchored bottom-centre on the sceneConfig box, like every sheet. 144 + 72
    // + 50 puts the console's last opaque row back on the box's bottom edge at
    // y216; 34 + 52 + 1 does the same for the sigil's at y86.
    const box = COMMAND_CENTER_PROPS.find((prop) => prop.key === expected.anchorProp);
    assert.deepEqual(propAnchorFor(entry, box), {
      x: box.x + box.w / 2,
      y: box.y + box.h + expected.offsetY,
      originX: 0.5,
      originY: 1,
      scale: 1
    }, `${expected.machine} anchor`);
    if (expected.groundShadow === false) {
      assert.equal(propShadowFor(entry, box), null, `${expected.machine} pools a shadow on the floor below the wall`);
    } else {
      assert.deepEqual(propShadowFor(entry, box), {
        x: box.x + box.w / 2,
        y: box.y + box.h,
        width: expected.shadowWidth * 1.4,
        height: expected.shadowWidth * 1.4 * 0.22,
        alpha: 0.55
      }, `${expected.machine} contact shadow`);
      // The pool follows the art, not the floor-plan box: 168px of console in a
      // 192px box. Sizing off the box would have drawn a pool 24px too wide.
      assert.notEqual(entry.shadowWidth, box.w);
    }

    // Listed in the manifest, and queued as exactly one plain image.
    const listed = new Set(JSON.parse(
      fs.readFileSync(`${__dirname}/../public/assets/command-center/manifest.json`, 'utf8')
    ).files);
    assert.equal(listed.has(expected.art), true, `${expected.art} missing from manifest.json`);
    const loader = fakeLoader();
    queuePropArt(entry, loader);
    assert.deepEqual(loader.calls, [{ method: 'image', key: expected.textureKey, art: expected.art }]);
  });
});

test('the Ops Console art retires its whitebox desk but never the GA//OPS wall display', () => {
  const console_ = propSheetFor('ops_console');
  const replacedProps = replacedWhiteboxKeys([console_]);
  const replaced = replacedComponentKeys([console_]);

  // Body and all three procedural components stop being drawn, and all four stay
  // in sceneConfig as the development fallback.
  assert.notEqual(
    COMMAND_CENTER_PROPS.find((prop) => prop.key === 'prop_ops_console'),
    undefined,
    'prop_ops_console must stay in sceneConfig as the whitebox fallback'
  );
  assert.equal(replacedProps.has('prop_ops_console'), true, 'the whitebox desk still draws under the art');
  ['anim_ops_desk_screens', 'anim_keyboard_leds', 'anim_ops_caret'].forEach((key) => {
    assert.notEqual(
      COMMAND_CENTER_COMPONENTS.find((component) => component.key === key),
      undefined,
      `${key} must stay in sceneConfig as the whitebox fallback`
    );
    assert.equal(replaced.has(key), true, `${key} still renders over the art`);
  });

  // The large wall display above it is a different machine — `wall_crt_bank`,
  // still unshipped — and it carries the GA//OPS readout. No entry may swallow
  // its body or its component, or the room loses its status screen.
  assert.equal(replacedProps.has('prop_wall_crt_bank'), false, 'the Ops Console swallowed the wall display');
  assert.equal(replaced.has('anim_ops_screens'), false, 'the Ops Console swallowed the GA//OPS readout');
  const live = PROP_SHEETS.filter((entry) => entry.id !== 'wall_crt_bank');
  assert.equal(replacedWhiteboxKeys(live).has('prop_wall_crt_bank'), false);
  assert.equal(replacedComponentKeys(live).has('anim_ops_screens'), false);
  const scene = fs.readFileSync(`${__dirname}/../src/command-center/CommandCenterScene.mjs`, 'utf8');
  assert.match(scene, /this\.componentObjects\.get\('anim_ops_screens'\)/);
  assert.match(scene, /GA\/\/OPS/);

  // The console art clears the wall display's bottom edge rather than crowding
  // it: the box bottom is y108 and the art's top row lands at y112.
  const box = COMMAND_CENTER_PROPS.find((prop) => prop.key === 'prop_ops_console');
  const wall = COMMAND_CENTER_PROPS.find((prop) => prop.key === 'prop_wall_crt_bank');
  const artTop = propAnchorFor(console_, box).y - 203 + 49;
  assert.equal(artTop, 112);
  assert.ok(artTop > wall.y + wall.h, 'the console art overlaps the wall display');

  // The cable stub that used to float at 432,132 went with this pass — box and
  // registry entry together, the way prop_crate_small did.
  assert.equal(
    COMMAND_CENTER_PROPS.find((prop) => prop.key === 'prop_ops_cable_stub'),
    undefined,
    'prop_ops_cable_stub should be deleted, not left floating over the console art'
  );
  assert.equal(propSheetFor('ops_cable_stub'), null, 'the cable stub box went but its registry entry stayed');

  // SpawnCamper is untouched by the art pass: same anchor, same operate visual.
  const zone = COMMAND_CENTER_AREAS.find((area) => area.id === 'central-operations');
  assert.deepEqual(zone.destination, { x: 480, y: 228 });
  assert.equal(zone.zoneNumber, '01');
  assert.equal(camperStationaryVisualFor('operate'), 'operate_back');
});

test('the twelve shipped machine sheets resolve as animated art in the registry', () => {
  SHIPPED_MACHINE_SHEETS.forEach((expected) => {
    const entry = propSheetFor(expected.id);
    assert.notEqual(entry, null, `${expected.machine} is not in the prop registry`);
    assert.equal(entry.type, PROP_ANIMATED, `${expected.machine} is not an animated entry`);
    assert.equal(isAnimatedProp(entry), true, `${expected.machine} does not resolve as animated`);

    // The sheet is the whole machine: one file, one texture, no static base.
    assert.equal(entry.art, expected.art, `${expected.machine} art path`);
    assert.equal(entry.textureKey, expected.textureKey, `${expected.machine} texture key`);
    assert.equal(entry.covers[0], expected.anchorProp, `${expected.machine} anchor prop`);
    assert.equal(entry.repeat, -1, `${expected.machine} must loop`);
    assert.equal(entry.fps, expected.fps, `${expected.machine} fps`);

    // Native scale and native origin, no export fudging. The override budget is
    // measured numbers and a mirror: a vertical nudge, an optional flip, and the
    // measured art width the contact shadow is sized from. Anything that would
    // rescale or re-origin the art belongs back in Sprite Fusion, not here.
    assert.equal(entry.scale, undefined, `${expected.machine} must not override scale`);
    assert.equal(entry.offsetX, undefined, `${expected.machine} must not override offsetX`);
    assert.equal(entry.originX, undefined, `${expected.machine} must not override originX`);
    assert.equal(entry.originY, undefined, `${expected.machine} must not override originY`);
    assert.equal(entry.offsetY, expected.offsetY, `${expected.machine} offsetY`);

    // And the registry still carries no coordinates of its own.
    assert.equal(entry.x, undefined, `${expected.machine} must not carry an x`);
    assert.equal(entry.y, undefined, `${expected.machine} must not carry a y`);
  });
});

test('only the two machines exported facing the wrong way are mirrored, and only from registry data', () => {
  const flipped = PROP_SHEETS.filter((entry) => entry.flipX);
  assert.deepEqual(flipped.map((entry) => entry.id).sort(), ['code_bench', 'creator_console']);

  // A mirror is for art that reads the wrong way round, not a positioning trick:
  // no static prop needs one, and nothing pairs it with an origin override that
  // would move the machine sideways as it flipped.
  flipped.forEach((entry) => {
    assert.equal(entry.type, PROP_ANIMATED, `${entry.id} flips but is not animated art`);
    assert.equal(entry.originX, undefined, `${entry.id} flips about a moved origin`);
    assert.equal(entry.offsetX, undefined, `${entry.id} flips and slides`);
  });
  PROP_SHEETS.filter((entry) => entry.type === PROP_STATIC).forEach((entry) => {
    assert.equal(entry.flipX, undefined, `${entry.id} is a static prop and must not flip`);
  });

  // Mirroring is only harmless because the art sits centred in its cell: flipping
  // about a centred origin lands the machine back on the same floor spot. If a
  // re-export ever shifts the art off centre, the flip starts sliding it.
  flipped.forEach((entry) => {
    const measured = readPngOpaqueBounds(`${__dirname}/../public${entry.art}`, entry.frameWidth, entry.frameHeight);
    const drift = Math.abs(measured.centreX - entry.frameWidth / 2);
    assert.ok(drift <= 0.5, `${entry.id} art is ${drift}px off its cell centre, so flipping slides it`);
  });

  // And the flip is data, applied in one place: the scene never names a machine.
  const scene = fs.readFileSync(`${__dirname}/../src/command-center/CommandCenterScene.mjs`, 'utf8');
  assert.match(scene, /if \(entry\.flipX\) object\.setFlipX\(true\);/);
  assert.doesNotMatch(scene, /creator_console|code_bench|anim_repo_forge|anim_creator_console/);
});

test('every shipped sheet records the art width its generated shadow is sized from', () => {
  SHIPPED_MACHINE_SHEETS.forEach((expected) => {
    const entry = propSheetFor(expected.id);
    assert.equal(entry.shadowWidth, expected.shadowWidth, `${expected.machine} shadowWidth`);
    assert.equal(entry.flipX, expected.flipX, `${expected.machine} flipX`);
    assert.equal(entry.groundShadow, expected.groundShadow, `${expected.machine} groundShadow`);

    const measured = readPngOpaqueBounds(`${__dirname}/../public${entry.art}`, entry.frameWidth, entry.frameHeight);

    // Wall art records no width because it draws no pool: a shadow width on an
    // entry that opts out would be a number nothing reads and nothing checks.
    if (expected.groundShadow === false) {
      assert.equal(entry.shadowWidth, undefined, `${expected.machine} is wall art and must record no shadowWidth`);
      const wallBox = COMMAND_CENTER_PROPS.find((prop) => prop.key === expected.anchorProp);
      assert.equal(propShadowFor(entry, wallBox), null, `${expected.machine} pools a shadow on the floor below the wall`);
    } else {
      // The recorded width is the art's, not the box's — that is the whole point
      // of carrying it. Checked against the real pixels, unioned over every frame.
      assert.equal(entry.shadowWidth, measured.width, `${expected.machine} shadowWidth is not the art's real width`);
    }

    // While the pixels are decoded anyway: the vertical nudge is the empty rows
    // under the machine, and the sheets that declare none have none worth naming.
    if (entry.offsetY === undefined) {
      assert.ok(measured.bottomSlack <= 2, `${expected.machine} floats ${measured.bottomSlack}px and declares no offsetY`);
    } else {
      assert.equal(entry.offsetY, measured.bottomSlack, `${expected.machine} offsetY is not its measured bottom slack`);
    }
  });

  // Anchor boxes are floor plans, not outlines, so most of these differ — which
  // is exactly why a box-derived shadow would have been wrong.
  const scanner = propSheetFor('scanner_bench');
  const scannerBox = COMMAND_CENTER_PROPS.find((prop) => prop.key === 'prop_scanner_bench');
  assert.notEqual(scanner.shadowWidth, scannerBox.w);
});

test('machine art casts a generated contact shadow on the floor line it stands on', () => {
  const boxFor = (key) => COMMAND_CENTER_PROPS.find((prop) => prop.key === key);

  // Centred on the anchor, sitting on the box's bottom edge — the same floor
  // contact point offsetY exists to preserve — and sized from the measured art.
  assert.deepEqual(propShadowFor(propSheetFor('creator_console'), boxFor('prop_creator_console')), {
    x: 324, y: 276, width: 123 * 1.4, height: 123 * 1.4 * 0.22, alpha: 0.55
  });

  // Anchors on a 120px chamber but spans 165px of racks: the pool follows the art.
  assert.deepEqual(propShadowFor(propSheetFor('furnace_chamber'), boxFor('prop_furnace_chamber')), {
    x: 828, y: 360, width: 165 * 1.4, height: 165 * 1.4 * 0.22, alpha: 0.55
  });

  // Small machines stop squashing: below the floor the pool would read as a line.
  assert.deepEqual(propShadowFor(propSheetFor('radar_drum'), boxFor('prop_radar_drum')), {
    x: 120, y: 240, width: 54 * 1.4, height: 18, alpha: 0.55
  });

  // Unmeasured art falls back to the whitebox footprint rather than casting none.
  assert.deepEqual(propShadowFor({}, { x: 0, y: 0, w: 100, h: 10 }), {
    x: 50, y: 10, width: 140, height: 140 * 0.22, alpha: 0.55
  });

  // Wall-mounted art stands on nothing.
  PROP_SHEETS.filter((entry) => entry.groundShadow === false).forEach((entry) => {
    assert.match(entry.id, /^wall_/, `${entry.id} opts out of a floor shadow but is not wall art`);
    assert.equal(propShadowFor(entry, { x: 0, y: 0, w: 10, h: 10 }), null, `${entry.id} still pools a shadow`);
  });
  assert.equal(propShadowFor(propSheetFor('creator_console'), null), null);

  // Drawn as its own pass before the art pass, so every pool ends up under every
  // machine and not just its own, and under props without naming a new layer.
  const scene = fs.readFileSync(`${__dirname}/../src/command-center/CommandCenterScene.mjs`, 'utf8');
  const shadowPass = scene.indexOf('live.forEach((entry) => this.addPropShadow(entry));');
  const artPass = scene.indexOf('live.forEach((entry) => this.addPropArt(entry));');
  assert.notEqual(shadowPass, -1, 'buildProps never draws the shadows');
  assert.ok(shadowPass < artPass, 'shadows are drawn over the machines');
  assert.match(scene, /this\.addGlow\(at\.x, at\.y, at\.width, at\.height, P\.void, at\.alpha, false\)\s*\.setDepth\(DEPTH\.props - 1\)/);
});

test('the twelve shipped sheets tile exactly at the dimensions their PNGs really are', () => {
  SHIPPED_MACHINE_SHEETS.forEach((expected) => {
    const entry = propSheetFor(expected.id);
    const file = `${__dirname}/../public${entry.art}`;
    assert.equal(fs.existsSync(file), true, `${expected.art} is missing from public/`);

    // The exported grid is trusted over any prior assumption, but it has to
    // divide exactly or Phaser slices partial frames out of the sheet.
    const { width, height } = readPngSize(file);
    assert.deepEqual(
      { width, height },
      { width: expected.sheetWidth, height: expected.sheetHeight },
      `${expected.art} is ${width}x${height}, expected ${expected.sheetWidth}x${expected.sheetHeight}`
    );
    assert.deepEqual(
      { sheetWidth: entry.sheetWidth, sheetHeight: entry.sheetHeight },
      { sheetWidth: width, sheetHeight: height },
      `${expected.machine} registry dimensions drifted from the file`
    );

    // A single horizontal strip; frameHeight is the sheet height, not
    // necessarily the frame width.
    assert.equal(entry.frames, expected.frames, `${expected.machine} frame count`);
    assert.equal(entry.frameWidth, expected.frameWidth, `${expected.machine} frame width`);
    assert.equal(entry.frameHeight, expected.frameHeight, `${expected.machine} frame height`);
    assert.equal(entry.frameWidth * entry.frames, width, `${expected.machine} frames do not tile the width`);
    assert.equal(entry.frameHeight, height, `${expected.machine} frame height is not the sheet height`);

    // RGBA, or the transparent surround would render as a solid block.
    assert.equal(readPngColorType(file), 6, `${expected.art} must be truecolour RGBA`);

    // Every playback index is in bounds and used exactly once.
    const order = propFrameOrderFor(entry);
    assert.equal(order.length, entry.frames, `${expected.machine} frame order length`);
    assert.deepEqual([...order].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7], `${expected.machine} frame order`);
  });
});

test('the manifest ships the twelve machine sheets so they actually preload', () => {
  const manifest = JSON.parse(
    fs.readFileSync(`${__dirname}/../public/assets/command-center/manifest.json`, 'utf8')
  );
  const listed = new Set(manifest.files);

  SHIPPED_MACHINE_SHEETS.forEach((expected) => {
    assert.equal(listed.has(expected.art), true, `${expected.art} missing from manifest.json`);
  });

  // Listed means queued, and queued means one spritesheet call at the measured
  // frame size — never an image, and never a second file alongside it.
  const queued = propsToPreload(listed);
  SHIPPED_MACHINE_SHEETS.forEach((expected) => {
    const entry = queued.find((candidate) => candidate.id === expected.id);
    assert.notEqual(entry, undefined, `${expected.machine} is listed but not queued for preload`);

    const loader = fakeLoader();
    queuePropArt(entry, loader);
    assert.equal(loader.calls.length, 1, `${expected.machine} queued more than one file`);
    assert.deepEqual(loader.calls[0], {
      method: 'spritesheet',
      key: expected.textureKey,
      art: expected.art,
      config: { frameWidth: expected.frameWidth, frameHeight: expected.frameHeight }
    });
  });
});

test('the twelve shipped machines anchor bottom-centre on their whitebox box', () => {
  SHIPPED_MACHINE_SHEETS.forEach((expected) => {
    const entry = propSheetFor(expected.id);
    const box = COMMAND_CENTER_PROPS.find((prop) => prop.key === expected.anchorProp);
    assert.notEqual(box, undefined, `${expected.anchorProp} is not a whitebox prop`);

    // sceneConfig geometry stays authoritative; the registry carries no
    // coordinates, so art taller than its whitebox grows upward from the same
    // floor contact point instead of sliding off station.
    assert.deepEqual(propAnchorFor(entry, box), {
      x: box.x + box.w / 2,
      y: box.y + box.h + (expected.offsetY || 0),
      originX: 0.5,
      originY: 1,
      scale: 1
    }, `${expected.machine} anchor`);

    // sceneConfig is the only source of position: with no box there is no anchor
    // to fall back on, because the registry has no coordinates to fall back to.
    assert.equal(propAnchorFor(entry, null), null, `${expected.machine} invented an anchor`);
  });

  // The Newsletter Still spelled out, since it is the one entry whose landing
  // point is not simply the bottom edge of its box. `prop_still_column` is
  // {264,312,72,144}; 312 + 144 + 21 puts the base plate's last opaque row on
  // the same floor line every other machine contacts.
  const still = propSheetFor('still_column');
  const stillBox = COMMAND_CENTER_PROPS.find((prop) => prop.key === 'prop_still_column');
  assert.deepEqual(propAnchorFor(still, stillBox), {
    x: 300, y: 477, originX: 0.5, originY: 1, scale: 1
  });
});

test('the twelve shipped machines loop when worked at, and hold their first frame otherwise', () => {
  const anims = fakeAnims();

  SHIPPED_MACHINE_SHEETS.forEach((expected) => {
    const entry = propSheetFor(expected.id);
    const key = `prop_${expected.id}`;

    assert.equal(propAnimationKeyFor(entry), key, `${expected.machine} animation key`);
    assert.deepEqual(propPlaybackFor(entry, { active: true }), { kind: 'play', key });
    // Unattended and reduced motion both land on frame 0 of the same sheet — no
    // second, static PNG anywhere in the pipeline.
    assert.deepEqual(propPlaybackFor(entry, { active: false }), { kind: 'frame', frame: 0 });
    assert.deepEqual(
      propPlaybackFor(entry, { reducedMotion: true, active: true }),
      { kind: 'frame', frame: 0 },
      `${expected.machine} runs under reduced motion`
    );
    assert.equal(propStaticFrameFor(entry), 0, `${expected.machine} static frame`);

    assert.equal(ensurePropAnimation(entry, anims), key);
    // Registered once, never restarted.
    ensurePropAnimation(entry, anims);
  });

  assert.equal(anims.created.length, SHIPPED_MACHINE_SHEETS.length, 'a machine loop was created twice');
  assert.deepEqual(anims.created.map((entry) => entry.frameRate), [8, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6]);
  anims.created.forEach((created) => {
    assert.equal(created.repeat, -1, `${created.key} does not loop`);
    assert.deepEqual(created.frames.frames, [0, 1, 2, 3, 4, 5, 6, 7], `${created.key} frames`);
  });
});

test('the Newsletter Still sheet is the whole machine, column and tray both', () => {
  const still = propSheetFor('still_column');

  // One physical machine for both newsletter stages, and one sheet for all of
  // it: the export animates the chamber, the coil and the output tray in frame,
  // so both whitebox bodies and all three procedural components retire with it.
  assert.equal(still.type, PROP_ANIMATED);
  assert.deepEqual([...still.covers], ['prop_still_column', 'prop_still_tray']);
  assert.deepEqual(
    [...still.coversComponents],
    ['anim_still_chamber', 'anim_still_coil', 'anim_tray_print']
  );

  // Folded in the way the mast was: a second entry would claim prop_still_tray
  // twice and leave a duplicate whitebox under the real machine.
  assert.equal(propSheetFor('still_tray'), null, 'the tray is folded into the still sheet');

  // Both bodies and all three components really do stop being drawn.
  const replacedProps = replacedWhiteboxKeys([still]);
  const replacedComponents = replacedComponentKeys([still]);
  ['prop_still_column', 'prop_still_tray'].forEach((key) => {
    assert.notEqual(
      COMMAND_CENTER_PROPS.find((prop) => prop.key === key),
      undefined,
      `${key} must stay in sceneConfig as the whitebox fallback`
    );
    assert.equal(replacedProps.has(key), true, `${key} still draws under the art`);
  });
  ['anim_still_chamber', 'anim_still_coil', 'anim_tray_print'].forEach((key) => {
    assert.notEqual(
      COMMAND_CENTER_COMPONENTS.find((component) => component.key === key),
      undefined,
      `${key} must stay in sceneConfig as the whitebox fallback`
    );
    assert.equal(replacedComponents.has(key), true, `${key} still renders over the art`);
  });

  // Nothing else in zone 05 is swept up: the retired foreground strip is not
  // machine art, and no registry entry may claim it.
  const foreKeys = new Set(COMMAND_CENTER_FOREGROUND.map((piece) => piece.key));
  assert.equal(foreKeys.has('fore_still_base'), false, 'fore_still_base should stay retired');
  PROP_SHEETS.forEach((sheet) => {
    assert.equal(sheet.covers.includes('fore_still_base'), false, `${sheet.id} claims an occluder`);
    assert.equal(
      sheet.coversComponents.includes('fore_still_base'), false, `${sheet.id} claims an occluder`
    );
  });
});

test('the Newsletter Still art does not disturb routing, telemetry or the camper', () => {
  // The still is one machine covering both newsletter Hermes jobs, and the art
  // pass must not have split it or renamed its lane.
  const machine = machineForWorkflow('newsletter');
  assert.equal(machine.id, 'newsletter-still');
  assert.equal(machine.areaId, 'newsletter');
  assert.deepEqual(machine.workflows, ['newsletter']);
  assert.deepEqual(machine.hermesJobs.map((job) => job.id).sort(), ['finisher', 'newsletter']);
  assert.equal(machineForHermesJobId('newsletter').id, 'newsletter-still');
  assert.equal(machineForHermesJobId('finisher').id, 'newsletter-still');

  // Station geometry is untouched, so he still walks to the same anchor.
  const zone = COMMAND_CENTER_AREAS.find((area) => area.id === 'newsletter');
  assert.deepEqual(zone.destination, { x: 300, y: 480 });
  assert.equal(zone.zoneNumber, '05');

  // And still works the machine with operate_back, in front of it.
  assert.equal(STATE_VISUALS.newsletter.camperAnim, 'operate');
  assert.equal(camperStationaryVisualFor('operate'), 'operate_back');
  assert.equal(CAMPER_VISUAL_FOR_MODE.operate, 'operate_back');

  // The registry still knows nothing about telemetry: it declares a loop and the
  // frame to hold, and the scene decides which of the two applies from where
  // SpawnCamper is standing.
  const still = propSheetFor('still_column');
  assert.equal(still.repeat, -1);
  assert.deepEqual(propPlaybackFor(still, { active: true }), { kind: 'play', key: 'prop_still_column' });
  assert.deepEqual(propPlaybackFor(still, { active: false }), { kind: 'frame', frame: 0 });
  const propSource = fs.readFileSync(`${__dirname}/../src/command-center/propSheets.mjs`, 'utf8');
  assert.doesNotMatch(propSource, /telemetry|hermes|newsletterState|jobStatus/i);
});

test('the X Uplink sheet owns the mast, and the rest of the room stays whitebox', () => {
  const uplink = propSheetFor('x_console');

  // The export bakes the antenna mast into the console, so one entry owns both
  // whitebox bodies and all three of their components. A separate mast entry
  // would claim prop_x_mast twice and break the one-machine-one-owner rule.
  assert.deepEqual([...uplink.covers], ['prop_x_console', 'prop_x_mast']);
  assert.deepEqual([...uplink.coversComponents], ['anim_x_crt', 'anim_x_lamps', 'anim_x_dish']);
  assert.equal(propSheetFor('x_mast'), null, 'the mast is folded into the uplink sheet');

  const live = SHIPPED_MACHINE_SHEETS.map((expected) => propSheetFor(expected.id));

  // Exactly these bodies and components retire — nothing else is suppressed.
  assert.deepEqual([...replacedWhiteboxKeys(live)].sort(), [
    'prop_code_bench', 'prop_creator_console', 'prop_disk_tower',
    'prop_experiment_bench', 'prop_furnace_chamber', 'prop_profit_analyzer',
    'prop_rack_a', 'prop_rack_b', 'prop_radar_drum', 'prop_scanner_bench',
    'prop_still_column', 'prop_still_tray',
    'prop_tx_body', 'prop_wall_agent_lab', 'prop_wall_feed_shells',
    'prop_x_console', 'prop_x_mast'
  ]);
  assert.deepEqual([...replacedComponentKeys(live)].sort(), [
    'anim_code_leds', 'anim_code_scroll', 'anim_creator_screens', 'anim_disk_reel',
    'anim_fan', 'anim_feed_cycle', 'anim_furnace_heat', 'anim_profit_screens',
    'anim_rack_leds', 'anim_radar_sweep', 'anim_scan_bar', 'anim_scan_lamp',
    'anim_still_chamber', 'anim_still_coil', 'anim_tray_print',
    'anim_tx_charge', 'anim_tx_crt', 'anim_tx_pilot',
    'anim_x_crt', 'anim_x_dish', 'anim_x_lamps'
  ]);

  // Every other machine in the room is still waiting on art and keeps its
  // procedural whitebox: unshipped entries make zero requests. The Ops Console
  // is the one exception and the one shipped static prop — its file IS listed,
  // so it is expected on this seam alongside the twelve sheets.
  const listed = new Set(JSON.parse(
    fs.readFileSync(`${__dirname}/../public/assets/command-center/manifest.json`, 'utf8')
  ).files);
  const shippedIds = new Set([
    ...SHIPPED_MACHINE_SHEETS.map((expected) => expected.id),
    ...SHIPPED_STATIC_PROPS.map((expected) => expected.id)
  ]);
  PROP_SHEETS.forEach((sheet) => {
    if (shippedIds.has(sheet.id)) return;
    assert.equal(sheet.type, PROP_STATIC, `${sheet.id} unexpectedly became animated`);
    assert.equal(listed.has(sheet.art), false, `${sheet.id} is unshipped but listed in the manifest`);
  });
  assert.deepEqual(propsToPreload(listed).map((sheet) => sheet.id).sort(), [...shippedIds].sort());
});

test('art pass 2 folds the secondary bodies in and leaves no duplicate whitebox', () => {
  // Same shape of case as the X Uplink mast and the Newsletter Still tray: the
  // export is the whole workstation / the whole furnace assembly, so ONE entry
  // owns every box in it. A second entry per body would claim a prop twice and
  // leave a duplicate whitebox rendering under the real machine.
  const forge = propSheetFor('code_bench');
  assert.equal(forge.type, PROP_ANIMATED);
  assert.deepEqual([...forge.covers], ['prop_code_bench', 'prop_disk_tower']);
  assert.deepEqual(
    [...forge.coversComponents],
    ['anim_code_scroll', 'anim_code_leds', 'anim_disk_reel']
  );
  assert.equal(propSheetFor('disk_tower'), null, 'the disk tower is folded into the forge sheet');

  const furnace = propSheetFor('furnace_chamber');
  assert.equal(furnace.type, PROP_ANIMATED);
  assert.deepEqual(
    [...furnace.covers],
    ['prop_furnace_chamber', 'prop_rack_a', 'prop_rack_b']
  );
  assert.deepEqual(
    [...furnace.coversComponents],
    ['anim_furnace_heat', 'anim_rack_leds', 'anim_fan']
  );
  assert.equal(propSheetFor('rack_a'), null, 'rack A is folded into the furnace sheet');
  assert.equal(propSheetFor('rack_b'), null, 'rack B is folded into the furnace sheet');

  // The anchor is the chamber, not a rack: the assembly's floor contact is the
  // chamber's bottom edge, and anchoring on a rack would hang it 96px high.
  assert.equal(furnace.covers[0], 'prop_furnace_chamber');
  assert.equal(machineById('model-furnace').propKeys[0], 'prop_furnace_chamber');
  assert.equal(machineById('repo-forge').propKeys[0], 'prop_code_bench');

  // Every folded-in body survives in sceneConfig as the whitebox fallback, and
  // every one of them really does stop being drawn under the art.
  const live = [forge, furnace, propSheetFor('creator_console')];
  const replacedProps = replacedWhiteboxKeys(live);
  const replacedComponents = replacedComponentKeys(live);
  ['prop_code_bench', 'prop_disk_tower', 'prop_furnace_chamber', 'prop_rack_a',
    'prop_rack_b', 'prop_creator_console'].forEach((key) => {
    assert.notEqual(
      COMMAND_CENTER_PROPS.find((prop) => prop.key === key), undefined,
      `${key} must stay in sceneConfig as the whitebox fallback`
    );
    assert.equal(replacedProps.has(key), true, `${key} still draws under the art`);
  });
  ['anim_code_scroll', 'anim_code_leds', 'anim_disk_reel', 'anim_furnace_heat',
    'anim_rack_leds', 'anim_fan', 'anim_creator_screens'].forEach((key) => {
    assert.notEqual(
      COMMAND_CENTER_COMPONENTS.find((component) => component.key === key), undefined,
      `${key} must stay in sceneConfig as the whitebox fallback`
    );
    assert.equal(replacedComponents.has(key), true, `${key} still renders over the art`);
  });

  // News Array took delivery in art pass 3 and is the one shipped sheet that
  // hangs on the wall. It kept the anchor it already had — the strip was never
  // repurposed — and it is the only animated entry that opts out of a floor pool.
  const news = PROP_SHEETS.find((sheet) => sheet.covers.includes('prop_wall_feed_shells'));
  assert.equal(news.id, 'wall_feed_shells');
  assert.equal(news.type, PROP_ANIMATED);
  assert.equal(news.art, '/assets/command-center/anim_news_array_sheet.png');
  assert.equal(news.groundShadow, false, 'wall art must not pool a shadow on the floor');
  assert.equal(news.shadowWidth, undefined, 'wall art records no art width');
  assert.deepEqual([...news.coversComponents], ['anim_feed_cycle']);
  assert.deepEqual([...machineById('news-array').propKeys], ['prop_wall_feed_shells']);
  assert.equal(replacedWhiteboxKeys([news]).has('prop_wall_feed_shells'), true);

  // The scanner triple is one machine now: Tool Scanner keeps the sheet and the
  // bench it already had, Experiment Bench left for the centre pocket the Power
  // Core used to hold (art pass 4), and Agent Lab left for the upper-right wall
  // (art pass 5). Nothing else may claim the bench.
  assert.equal(propSheetFor('scanner_bench').art, '/assets/command-center/anim_tool_scanner_sheet.png');
  assert.deepEqual([...machineById('tool-scanner').propKeys], ['prop_scanner_bench'], 'tool-scanner anchor moved');
  assert.deepEqual([...machineById('agent-lab').propKeys], ['prop_wall_agent_lab'], 'agent-lab still on the bench');
  assert.deepEqual(
    COMMAND_CENTER_MACHINES.filter((m) => m.propKeys.includes('prop_scanner_bench')).map((m) => m.id),
    ['tool-scanner'],
    'the scanner bench has more than one owner'
  );
  assert.deepEqual(
    PROP_SHEETS.filter((sheet) => sheet.covers.includes('prop_scanner_bench')).map((sheet) => sheet.id),
    ['scanner_bench'],
    'the scanner bench is covered by more than one sheet'
  );
  assert.deepEqual([...machineById('experiment-bench').propKeys], ['prop_experiment_bench']);

  // The decorative crate at 300,180 sat inside the Creator Console's floor
  // pocket, which the real 123x109 art fills. It is gone from both the geometry
  // and the registry — a box left in one but not the other fails the
  // every-prop-is-described invariant either way.
  assert.equal(COMMAND_CENTER_PROPS.find((prop) => prop.key === 'prop_crate_small'), undefined);
  assert.equal(propSheetFor('crate_small'), null);
  PROP_SHEETS.forEach((sheet) => {
    assert.equal(sheet.covers.includes('prop_crate_small'), false, `${sheet.id} covers a deleted prop`);
  });
});

// ---------------------------------------------------------------------------
// Whitebox cleanup pass.
// ---------------------------------------------------------------------------

test('the leftover whitebox dressing is deleted from geometry and registry together', () => {
  // Blank filler that was never going to take delivery of art: a 24x30 wall
  // receptacle, two 48x24 crates and a three-louvre vent bank. Each went the way
  // prop_crate_small did — box and registry entry in the same pass, because a box
  // present in one but not the other fails the every-prop-is-described invariant
  // in either direction.
  const removed = [
    ['prop_wall_receptacle', 'wall_receptacle'],
    ['prop_crate_wide_a', 'crate_wide_a'],
    ['prop_crate_wide_b', 'crate_wide_b'],
    ['prop_wall_vents', 'wall_vents']
  ];
  removed.forEach(([propKey, sheetId]) => {
    assert.equal(
      COMMAND_CENTER_PROPS.find((prop) => prop.key === propKey),
      undefined,
      `${propKey} is still in the geometry`
    );
    assert.equal(propSheetFor(sheetId), null, `${sheetId} is still in the art registry`);
    PROP_SHEETS.forEach((sheet) => {
      assert.equal(sheet.covers.includes(propKey), false, `${sheet.id} covers deleted prop ${propKey}`);
    });
    COMMAND_CENTER_MACHINES.forEach((machine) => {
      assert.equal(
        machine.propKeys.includes(propKey),
        false,
        `${machine.id} still anchors on deleted prop ${propKey}`
      );
    });
  });

  // Zone 07 is the transmitter cabinet and nothing else now: the receptacle rect
  // came out of its hit area, so the inspect outline strokes one box.
  const tx = COMMAND_CENTER_AREAS.find((area) => area.id === 'terminal-transmitter');
  assert.deepEqual([...tx.hitRects], [{ x: 696, y: 360, width: 168, height: 96 }]);
  assert.deepEqual([...machineById('publish-transmitter').propKeys], ['prop_tx_body']);

  // The two boxes that deliberately survive. `prop_wall_crt_bank` is the GA//OPS
  // readout's housing, still awaiting art and still drawing its whitebox;
  // `prop_wall_sigil` is the gold emblem, which has since taken delivery of its
  // PNG and kept only its box, as the anchor the art hangs on. Both are
  // intentional, neither is filler, and neither may be swept up by a later pass.
  ['prop_wall_crt_bank', 'prop_wall_sigil'].forEach((key) => {
    assert.notEqual(
      COMMAND_CENTER_PROPS.find((prop) => prop.key === key),
      undefined,
      `${key} must survive the cleanup pass`
    );
  });
  assert.notEqual(
    COMMAND_CENTER_COMPONENTS.find((component) => component.key === 'anim_ops_screens'),
    undefined,
    'the GA//OPS readout must survive the cleanup pass'
  );

  // Two bespoke renderers, each written for exactly one prop, each deleted with
  // it. The angled-vent polygon went with the vent bank; the gold "A" text object
  // went with the wall sigil's whitebox slab once the emblem PNG shipped. A
  // whitebox part is a rect, optionally rounded, and nothing else.
  const scene = fs.readFileSync(`${__dirname}/../src/command-center/CommandCenterScene.mjs`, 'utf8');
  const drawPart = scene.slice(
    scene.indexOf('drawWhiteboxPart(g, prop, part) {'),
    scene.indexOf('fillMaybeRounded(g, x, y, w, h, radius) {')
  );
  assert.notEqual(drawPart.length, 0, 'drawWhiteboxPart moved');
  assert.equal(/part\.taper/.test(drawPart), false, 'the taper branch outlived the vent bank');
  assert.equal(COMMAND_CENTER_PROPS.some((prop) => prop.parts.some((part) => part.taper)), false);
  assert.equal(COMMAND_CENTER_PROPS.some((prop) => prop.parts.some((part) => part.glyph)), false);
  assert.doesNotMatch(scene, /part\.glyph/, 'the glyph renderer outlived the sigil whitebox');
  assert.doesNotMatch(scene, /Russo One/, 'the whitebox glyph font outlived its only text object');
});

test('the wall sigil renders as the emblem PNG and nothing is drawn behind it', () => {
  const entry = propSheetFor('wall_sigil');
  const box = COMMAND_CENTER_PROPS.find((prop) => prop.key === 'prop_wall_sigil');

  // The box survives as the anchor — the art registry carries no coordinates —
  // but it draws nothing of its own. No slab, no gold stroke, no glyph: the
  // emblem is a transparent export and the only thing that renders here.
  assert.notEqual(box, undefined, 'the sigil lost the box its art anchors on');
  assert.deepEqual([...box.parts], [], 'a whitebox plate is still drawn behind the emblem');
  assert.equal(box.zone, '', 'the sigil is unzoned dressing and must own no zone');
  assert.deepEqual(
    { x: box.x, y: box.y, w: box.w, h: box.h },
    { x: 612, y: 34, w: 52, h: 52 },
    'the wall slot moved'
  );

  // Loading the art suppresses the whitebox for this prop and for nothing else.
  const replacedProps = replacedWhiteboxKeys([entry]);
  assert.equal(replacedProps.has('prop_wall_sigil'), true, 'the whitebox still draws under the emblem');
  assert.equal(replacedProps.has('prop_wall_crt_bank'), false, 'the sigil swallowed the GA//OPS housing');
  assert.deepEqual([...replacedComponentKeys([entry])], [], 'the sigil retired a component it does not own');

  // Where the real pixels land. The file is 64x64 with the glyph at x 8-54,
  // y 1-62, anchored bottom-centre at (638, 87) with offsetY 1, so the emblem
  // occupies x 614-661, y 24-86 at native scale.
  const at = propAnchorFor(entry, box);
  assert.deepEqual(at, { x: 638, y: 87, originX: 0.5, originY: 1, scale: 1 });

  const file = `${__dirname}/../public${entry.art}`;
  const measured = readPngOpaqueBounds(file, 64, 64);
  // Derived from the measured bounds, not from the cell: the glyph is not
  // symmetric in its 64x64 canvas (8 empty columns left, 9 right), so centring
  // the cell and centring the content are different answers.
  const left = at.x - 64 / 2 + measured.centreX - measured.width / 2;
  const top = at.y - measured.bottomSlack - measured.height;
  assert.deepEqual(
    { left, right: left + measured.width, top, bottom: top + measured.height },
    { left: 614, right: 661, top: 24, bottom: 86 }
  );

  // Inside the wall band, bottom flush with its own slot, top level with the
  // GA//OPS bank beside it, and clear of both neighbours on the upper wall.
  const crtBank = COMMAND_CENTER_PROPS.find((prop) => prop.key === 'prop_wall_crt_bank');
  const agentLab = COMMAND_CENTER_PROPS.find((prop) => prop.key === 'prop_wall_agent_lab');
  assert.ok(top >= 0 && top + measured.height <= COMMAND_CENTER_CANVAS.floorTop, 'the emblem leaves the wall band');
  assert.equal(top + measured.height, box.y + box.h, 'the emblem is not seated on its slot');
  assert.equal(top, crtBank.y, 'the emblem no longer lines up with the GA//OPS bank');
  assert.ok(left > crtBank.x + crtBank.w, 'the emblem overlaps the GA//OPS bank');
  assert.ok(left + measured.width < agentLab.x, 'the emblem overlaps the Agent Lab cabinet');

  // Wall art stands on nothing, so no pool is drawn under it, and a static prop
  // never animates: attendance can start nothing here.
  assert.equal(propShadowFor(entry, box), null, 'the emblem pools a shadow on the floor');
  assert.equal(propPlaybackFor(entry, { active: true }), null, 'the emblem has playback');

  // The PNG really is transparent-ground art: RGBA, and every pixel it draws is
  // fully opaque, so there is no baked plate and no half-lit fringe on the wall.
  assert.equal(readPngColorType(file), 6, 'the emblem must be truecolour RGBA');
  assert.deepEqual(measured.alpha, { opaque: 1654, semiTransparent: 0, transparent: 2442 });
});

// ---------------------------------------------------------------------------
// Physical anchor audit (geometry pass 2).
// ---------------------------------------------------------------------------

// One production sprite per workflow machine means one primary whitebox anchor
// per workflow machine. A machine may still own several boxes when they are
// genuinely one physical object — the Model Furnace is a chamber plus two racks,
// the X Uplink a console plus its mast — but unrelated machines must not share a
// primary prop just because the original whitebox did.
//
// `prop_scanner_bench` was a three-way share, then a two-way one, and is now Tool
// Scanner's alone: art pass 4 moved experiment-bench onto the retired Power
// Core's centre pocket, and art pass 5 gave Agent Lab its own wall anchor. The
// list is empty and stays empty — it is debt, not design, so nothing may be
// added to it, and the assertions below fail if anything is.
const KNOWN_SHARED_ANCHORS = Object.freeze({});

test('every canonical machine anchors on a real whitebox prop', () => {
  const propKeys = new Set(COMMAND_CENTER_PROPS.map((prop) => prop.key));

  COMMAND_CENTER_MACHINES.forEach((machine) => {
    assert.equal(machine.propKeys.length >= 1, true, `${machine.name} declares no prop`);
    machine.propKeys.forEach((key) => {
      assert.equal(propKeys.has(key), true, `${machine.name} names unknown prop ${key}`);
    });
    // The registry anchors art on covers[0]; machineConfig's propKeys[0] is the
    // same idea from the semantic side, so it has to resolve to a real box.
    const anchor = COMMAND_CENTER_PROPS.find((prop) => prop.key === machine.propKeys[0]);
    assert.notEqual(anchor, undefined, `${machine.name} primary anchor missing`);
  });
});

test('distinct workflow machines do not share a primary anchor', () => {
  const byAnchor = new Map();
  COMMAND_CENTER_MACHINES.forEach((machine) => {
    const anchor = machine.propKeys[0];
    if (!byAnchor.has(anchor)) byAnchor.set(anchor, []);
    byAnchor.get(anchor).push(machine.id);
  });

  const shared = [...byAnchor.entries()].filter(([, ids]) => ids.length > 1);
  shared.forEach(([anchor, ids]) => {
    assert.notEqual(
      KNOWN_SHARED_ANCHORS[anchor], undefined,
      `${anchor} is claimed by ${ids.join(', ')} — give each machine its own anchor`
    );
    assert.deepEqual([...ids].sort(), [...KNOWN_SHARED_ANCHORS[anchor]].sort(), `${anchor} sharers`);
  });

  // The exception list is exactly the debt we accepted, and no more: a new
  // collision cannot be waved through by appearing here.
  assert.deepEqual(shared.map(([anchor]) => anchor).sort(), Object.keys(KNOWN_SHARED_ANCHORS).sort());

  // Secondary boxes belong to the one machine that folded them in, so no prop is
  // claimed by two different machines at any position.
  const owner = new Map();
  COMMAND_CENTER_MACHINES.forEach((machine) => {
    machine.propKeys.forEach((key) => {
      if (KNOWN_SHARED_ANCHORS[key]) return;
      assert.equal(owner.has(key), false, `${key} is claimed by ${owner.get(key)} and ${machine.id}`);
      owner.set(key, machine.id);
    });
  });
});

test('News Array keeps a wall-mounted anchor, and the consoles that left it stand on the floor', () => {
  const boxFor = (key) => COMMAND_CENTER_PROPS.find((prop) => prop.key === key);

  // News Array's art is a shallow horizontal wall display, so its box stays
  // entirely inside the wall band — and so does the shipped art anchored on it.
  const news = boxFor(machineById('news-array').propKeys[0]);
  assert.equal(news.key, 'prop_wall_feed_shells');
  assert.equal(
    news.y + news.h <= COMMAND_CENTER_CANVAS.floorTop, true,
    'News Array anchor must stay wall-mounted'
  );

  const newsEntry = propSheetFor('wall_feed_shells');
  const newsBounds = readPngOpaqueBounds(
    `${__dirname}/../public${newsEntry.art}`, newsEntry.frameWidth, newsEntry.frameHeight
  );
  // Bottom-centre on the box plus the measured slack. `offsetY` pushes the whole
  // frame down by its empty rows, so the art's real bottom edge lands back on the
  // strip's bottom edge — which is the whole point of the nudge, and is what has
  // to stay in the wall band, not the frame's bottom.
  const newsAt = propAnchorFor(newsEntry, news);
  assert.equal(newsAt.y, news.y + news.h + 70);
  const newsBottom = newsAt.y - newsEntry.offsetY;
  assert.equal(newsBottom, news.y + news.h, 'News Array art does not sit on its wall strip');
  assert.equal(newsBottom <= COMMAND_CENTER_CANVAS.floorTop, true, 'News Array art hangs onto the floor');
  assert.equal(newsBottom - newsBounds.height >= 0, true, 'News Array art runs off the top of the canvas');

  // Creator Console and Profit Analyzer are floor-standing consoles now, each on
  // its own box, and neither is the wall strip any more. Both have since taken
  // delivery of their sheets, and both still anchor on the box they were given.
  [
    ['creator-console', 'prop_creator_console', { x: 264, y: 204, w: 120, h: 72 }, PROP_ANIMATED, 22],
    ['profit-analyzer', 'prop_profit_analyzer', { x: 636, y: 240, w: 108, h: 72 }, PROP_ANIMATED, 19]
  ].forEach(([machineId, propKey, expected, type, offsetY]) => {
    const machine = machineById(machineId);
    assert.deepEqual([...machine.propKeys], [propKey], `${machineId} anchor`);
    assert.notEqual(machine.propKeys[0], 'prop_wall_feed_shells');

    const box = boxFor(propKey);
    assert.deepEqual({ x: box.x, y: box.y, w: box.w, h: box.h }, expected, `${propKey} footprint`);
    assert.equal(
      box.y + box.h > COMMAND_CENTER_CANVAS.floorTop, true,
      `${propKey} must contact the floor, not the wall`
    );

    // Exactly one registry entry owns the box, and the geometry the art lands on
    // is still derived from sceneConfig plus a measured vertical nudge — the
    // registry carries no coordinates either way.
    const entry = PROP_SHEETS.find((sheet) => sheet.covers.includes(propKey));
    assert.notEqual(entry, undefined, `${propKey} has no registry entry`);
    assert.equal(entry.type, type, `${propKey} art type`);
    assert.deepEqual(propAnchorFor(entry, box), {
      x: box.x + box.w / 2, y: box.y + box.h + offsetY, originX: 0.5, originY: 1, scale: 1
    }, `${propKey} anchors bottom-centre`);
  });

  // Nothing else moved onto the wall strip: it is News Array's alone now.
  const onShells = COMMAND_CENTER_MACHINES.filter((m) => m.propKeys.includes('prop_wall_feed_shells'));
  assert.deepEqual(onShells.map((m) => m.id), ['news-array']);
});

test('the two new stations are reachable, axis-aligned, and south-anchored', () => {
  [
    ['creator-console', { x: 324, y: 288 }, '10'],
    ['profit-analyzer', { x: 690, y: 324 }, '11']
  ].forEach(([areaId, destination, zoneNumber]) => {
    const zone = COMMAND_CENTER_AREAS.find((area) => area.id === areaId);
    assert.notEqual(zone, undefined, `${areaId} has no zone`);
    assert.equal(zone.zoneNumber, zoneNumber);
    assert.deepEqual({ x: zone.destination.x, y: zone.destination.y }, destination);

    // Same invariant every other zone holds: he stands south of the machine, so
    // one operate_back animation serves it.
    const body = zone.hitRects[0];
    assert.equal(zone.destination.y >= body.y + body.height, true, `${areaId} anchor is not south of its body`);

    // And he can actually get there from home without a diagonal leg.
    const path = routeThroughWalkGraph(COMMAND_CENTER_CANVAS.homePoint, zone.destination);
    for (let i = 1; i < path.length; i += 1) {
      const diagonal = path[i].x !== path[i - 1].x && path[i].y !== path[i - 1].y;
      assert.equal(diagonal, false, `route to ${areaId} turned diagonally`);
    }
    assert.deepEqual(path[path.length - 1], destination, `route to ${areaId} does not end on its anchor`);
  });

  // The two new spurs are horizontal and land on an existing vertical lane, which
  // is what lets buildWalkGraph derive their crossing nodes with no other change.
  const spurs = COMMAND_CENTER_WALK_GRAPH.segments.filter((s) => s.id === 'creator-spur' || s.id === 'profit-spur');
  assert.equal(spurs.length, 2, 'both station spurs must exist');
  spurs.forEach((spur) => assert.equal(spur.from.y, spur.to.y, `${spur.id} must be horizontal`));
  assert.equal(spurs.find((s) => s.id === 'creator-spur').from.x, 240, 'creator-spur must meet west-lane');
  assert.equal(spurs.find((s) => s.id === 'profit-spur').from.x, 622, 'profit-spur must meet centre-spur');
});

test('the geometry pass changed no workflow, Hermes or telemetry semantics', () => {
  // Workflow keys and their machines are untouched: only which zone a machine
  // physically occupies moved.
  assert.deepEqual(
    COMMAND_CENTER_MACHINES.flatMap((m) => m.workflows).sort(),
    ['agents', 'ai-news', 'creator-content', 'models-infra', 'monetization',
      'new-tools', 'newsletter', 'playbooks', 'github', 'social-x', 'terminal-publisher'].sort()
  );

  // Every Hermes job still resolves to the machine it always did.
  const expectedJobs = {
    'ai-news': 'news-array',
    github: 'repo-forge',
    'new-tools': 'tool-scanner',
    agents: 'agent-lab',
    'models-infra': 'model-furnace',
    'creator-content': 'creator-console',
    monetization: 'profit-analyzer',
    playbooks: 'experiment-bench',
    newsletter: 'newsletter-still',
    finisher: 'newsletter-still',
    'x-draft': 'x-uplink',
    'x-publish': 'x-uplink',
    'x-amplify': 'x-uplink',
    'beehiiv-draft': 'publish-transmitter',
    '254525fa846f': 'opportunity-radar'
  };
  Object.entries(expectedJobs).forEach(([jobId, machineId]) => {
    assert.equal(machineForHermesJobId(jobId)?.id, machineId, `${jobId} Hermes mapping`);
  });

  // Zone 02 still exists and still owns News Array and the radar.
  assert.equal(canonicalAreaId('research'), 'intelligence-research');
  assert.equal(canonicalAreaId('ai-news'), 'intelligence-research');
  assert.equal(machineById('opportunity-radar').areaId, 'intelligence-research');

  // The twelve finished machines each anchor where they are supposed to.
  assert.deepEqual(
    ['radar_drum', 'scanner_bench', 'still_column', 'x_console',
      'creator_console', 'code_bench', 'furnace_chamber',
      'profit_analyzer', 'tx_body', 'wall_feed_shells', 'experiment_bench',
      'wall_agent_lab']
      .map((id) => propSheetFor(id).covers[0]),
    ['prop_radar_drum', 'prop_scanner_bench', 'prop_still_column', 'prop_x_console',
      'prop_creator_console', 'prop_code_bench', 'prop_furnace_chamber',
      'prop_profit_analyzer', 'prop_tx_body', 'prop_wall_feed_shells',
      'prop_experiment_bench', 'prop_wall_agent_lab']
  );
});

// ---------------------------------------------------------------------------
// Art pass 5: Agent Lab takes the upper-right wall and leaves the scanner bench.
// ---------------------------------------------------------------------------

test('the Agent Lab hangs on the right wall, alone, and casts no floor pool', () => {
  const boxFor = (key) => COMMAND_CENTER_PROPS.find((prop) => prop.key === key);
  const box = boxFor('prop_wall_agent_lab');
  const entry = propSheetFor('wall_agent_lab');

  // The box is the art's own footprint, not a floor plan: nothing stands on the
  // floor here, so there is no floor plan to draw.
  assert.deepEqual(
    { x: box.x, y: box.y, w: box.w, h: box.h, zone: box.zone },
    { x: 786, y: 20, w: 92, h: 160, zone: 'agent-lab' }
  );
  const measured = readPngOpaqueBounds(`${__dirname}/../public${entry.art}`, entry.frameWidth, entry.frameHeight);
  assert.deepEqual({ width: measured.width, height: measured.height }, { width: 91, height: 161 });

  // Wall-mounted: no pool on the floor below, and no art width to size one with.
  assert.equal(entry.groundShadow, false, 'wall art must not pool a shadow on the floor');
  assert.equal(entry.shadowWidth, undefined, 'wall art records no art width');
  assert.equal(propShadowFor(entry, box), null);
  // And the whitebox fallback under it stands on nothing either.
  box.parts.forEach((part) => assert.equal(part.shadow, undefined, 'wall whitebox drops a floor shadow'));

  // Bottom-centre + the measured 20 rows of slack put the cabinet at y 20-180,
  // spanning x 786.5-877.5 — 30px clear of the Profit Analyzer art (which reaches
  // x 756.5) and 57px clear of the Model Furnace art (which starts at y 237).
  assert.deepEqual(propAnchorFor(entry, box), { x: 832, y: 200, originX: 0.5, originY: 1, scale: 1 });

  // It is a full object, so it retires no procedural components: there is
  // nothing left to paint on top of finished art.
  assert.deepEqual([...entry.covers], ['prop_wall_agent_lab']);
  assert.deepEqual([...entry.coversComponents], []);
  assert.equal(COMMAND_CENTER_COMPONENTS.some((c) => c.zone === 'agent-lab'), false);

  // The cosmetic vent bank it took a slot from is gone entirely — box and
  // registry entry together — so the cabinet hangs on bare wall art and nothing
  // whitebox renders underneath or beside it.
  assert.equal(
    COMMAND_CENTER_PROPS.find((prop) => prop.key === 'prop_wall_vents'),
    undefined,
    'the vent bank is back in the geometry'
  );
  assert.equal(propSheetFor('wall_vents'), null, 'the vent bank box went but its registry entry stayed');
  PROP_SHEETS.forEach((sheet) => {
    assert.equal(sheet.covers.includes('prop_wall_vents'), false, `${sheet.id} covers a deleted prop`);
  });
});

test('zone 12 is reachable, axis-aligned, and south-anchored', () => {
  const zone = COMMAND_CENTER_AREAS.find((area) => area.id === 'agent-lab');
  assert.notEqual(zone, undefined, 'agent-lab has no zone');
  assert.equal(zone.zoneNumber, '12');
  assert.deepEqual({ x: zone.destination.x, y: zone.destination.y }, { x: 832, y: 192 });

  // Wall-mounted or not, the invariant is the same: he stands south of the
  // machine, so the one operate_back pose serves this station too.
  const body = zone.hitRects[0];
  assert.equal(zone.destination.y >= body.y + body.height, true, 'agent-lab anchor is not south of its body');
  assert.equal(zone.destination.x, body.x + body.width / 2, 'he does not stand in front of it');

  const path = routeThroughWalkGraph(COMMAND_CENTER_CANVAS.homePoint, zone.destination);
  for (let i = 1; i < path.length; i += 1) {
    const diagonal = path[i].x !== path[i - 1].x && path[i].y !== path[i - 1].y;
    assert.equal(diagonal, false, 'route to agent-lab turned diagonally');
  }
  assert.deepEqual(path[path.length - 1], { x: 832, y: 192 }, 'route to agent-lab does not end on its anchor');

  // Unlike the two floor stations, this spur is vertical: it drops from the wall
  // onto the horizontal furnace-spur, and buildWalkGraph derives the crossing at
  // (832, 372) itself — one new segment, no edits to any existing lane.
  const spur = COMMAND_CENTER_WALK_GRAPH.segments.find((s) => s.id === 'agent-spur');
  assert.notEqual(spur, undefined, 'agent-spur must exist');
  assert.equal(spur.from.x, spur.to.x, 'agent-spur must be vertical');
  const furnace = COMMAND_CENTER_WALK_GRAPH.segments.find((s) => s.id === 'furnace-spur');
  assert.equal(pointOnSegment({ x: spur.to.x, y: spur.to.y }, furnace), true, 'agent-spur must meet furnace-spur');
  assert.notEqual(walkNodes().get('832,372'), undefined, 'the crossing node was not derived');

  // Zone 03 stayed exactly where it was, and is Tool Scanner's alone.
  const scanner = COMMAND_CENTER_AREAS.find((area) => area.id === 'scanner-bench');
  assert.deepEqual({ x: scanner.destination.x, y: scanner.destination.y }, { x: 132, y: 324 });
  assert.deepEqual(scanner.hitRects[0], { x: 48, y: 264, width: 168, height: 48 });
  assert.equal(canonicalAreaId('new-tools'), 'scanner-bench');
  assert.equal(canonicalAreaId('agents'), 'agent-lab');
  assert.equal(machineById('agent-lab').areaId, 'agent-lab');
});

// ---------------------------------------------------------------------------
// Art pass 4: Experiment Bench takes the centre, and the Power Core is retired.
// ---------------------------------------------------------------------------

test('the Experiment Bench occupies the retired Power Core pocket, alone', () => {
  const boxFor = (key) => COMMAND_CENTER_PROPS.find((prop) => prop.key === key);

  // The box is the old core well's, transcribed unchanged — this was a move, not a
  // re-measure. Same 144x96 pocket, same centre, same floor line.
  const box = boxFor('prop_experiment_bench');
  assert.notEqual(box, undefined, 'the bench has no whitebox box');
  assert.deepEqual({ x: box.x, y: box.y, w: box.w, h: box.h }, { x: 408, y: 264, w: 144, h: 96 });
  assert.equal(box.zone, 'experiment-bench');
  assert.equal(box.parts.length > 0, true, 'the bench lost its whitebox fallback');

  // Zone 09 kept its number, its anchor and its conduit; only its identity moved.
  const zone = COMMAND_CENTER_AREAS.find((area) => area.id === 'experiment-bench');
  assert.notEqual(zone, undefined, 'zone 09 does not resolve to the bench');
  assert.equal(zone.zoneNumber, '09');
  assert.equal(zone.label, 'Experiment Bench');
  assert.deepEqual({ x: zone.destination.x, y: zone.destination.y }, { x: 480, y: 372 });
  assert.deepEqual(
    { x: zone.bounds.x, y: zone.bounds.y, width: zone.bounds.width, height: zone.bounds.height },
    { x: 408, y: 264, width: 144, height: 96 }
  );
  assert.deepEqual([...zone.conduits], ['D3']);

  // He stands south of it, so the one operate_back animation serves this station
  // like every other, and he gets there down existing lanes with no diagonal leg.
  const body = zone.hitRects[0];
  assert.equal(zone.destination.y >= body.y + body.height, true, 'the bench anchor is not south of its body');
  const path = routeThroughWalkGraph(COMMAND_CENTER_CANVAS.homePoint, zone.destination);
  for (let i = 1; i < path.length; i += 1) {
    const diagonal = path[i].x !== path[i - 1].x && path[i].y !== path[i - 1].y;
    assert.equal(diagonal, false, 'route to the experiment bench turned diagonally');
  }
  assert.deepEqual(path[path.length - 1], { x: 480, y: 372 });

  // The spur he arrives on is the Power Core's, renamed and otherwise untouched:
  // no walk-graph geometry changed for this move.
  const spur = COMMAND_CENTER_WALK_GRAPH.segments.find((segment) => segment.id === 'bench-spur');
  assert.notEqual(spur, undefined, 'the centre spur is gone');
  assert.deepEqual([spur.from, spur.to], [{ x: 480, y: 372 }, { x: 622, y: 372 }]);

  // Semantics are exactly what they were on the scanner bench. Only areaId and
  // propKeys moved; the workflow key and the Hermes job did not.
  const machine = machineById('experiment-bench');
  assert.equal(machine.areaId, 'experiment-bench');
  assert.deepEqual([...machine.propKeys], ['prop_experiment_bench']);
  assert.deepEqual([...machine.workflows], ['playbooks']);
  assert.deepEqual(machine.hermesJobs.map((job) => job.id), ['playbooks']);
  assert.equal(machineForWorkflow('playbooks').id, 'experiment-bench');
  assert.equal(machineForHermesJobId('playbooks').id, 'experiment-bench');
  assert.equal(areaIdForWorkflow({ workflow: 'playbooks', context: {} }), 'experiment-bench');
  assert.equal(canonicalAreaId('playbooks'), 'experiment-bench');

  // Art lands bottom-centre on that box plus its measured slack: 264 + 96 + 57.
  const entry = propSheetFor('experiment_bench');
  assert.equal(entry.type, PROP_ANIMATED);
  assert.deepEqual([...entry.covers], ['prop_experiment_bench']);
  assert.deepEqual([...entry.coversComponents], [], 'the sheet is the whole bench; nothing overlays it');
  assert.deepEqual(propAnchorFor(entry, box), {
    x: 480, y: 417, originX: 0.5, originY: 1, scale: 1
  });
  assert.deepEqual(propShadowFor(entry, box), {
    x: 480, y: 360, width: 127 * 1.4, height: 127 * 1.4 * 0.22, alpha: 0.55
  });
  assert.equal(entry.flipX, undefined, 'the bench export reads the right way round');

  // Measured against the real pixels rather than trusted from the registry.
  const measured = readPngOpaqueBounds(
    `${__dirname}/../public${entry.art}`, entry.frameWidth, entry.frameHeight
  );
  assert.equal(measured.width, 127);
  assert.equal(measured.bottomSlack, 57);
  assert.equal(Math.abs(measured.centreX - entry.frameWidth / 2) <= 0.5, true);
});

test('the Power Core is gone from the room in every direction it existed', () => {
  // The body, the registry entry and the three ambient components all go together:
  // a box surviving in one but not the other fails the every-prop-is-described
  // invariant either way, and a component with no owner outlives its machine.
  assert.equal(COMMAND_CENTER_PROPS.find((prop) => prop.key === 'prop_core_well'), undefined);
  assert.equal(propSheetFor('core_well'), null);
  PROP_SHEETS.forEach((sheet) => {
    assert.equal(sheet.covers.includes('prop_core_well'), false, `${sheet.id} covers a deleted prop`);
  });
  ['anim_core_pulse', 'anim_core_sigil', 'anim_core_seed'].forEach((key) => {
    assert.equal(
      COMMAND_CENTER_COMPONENTS.find((component) => component.key === key), undefined,
      `${key} outlived the Power Core`
    );
    Object.entries(STATE_VISUALS).forEach(([state, visual]) => {
      assert.equal(visual.components.includes(key), false, `${state} still drives ${key}`);
    });
  });

  // No zone, and no alias pointing at one: the two core tokens now fall through to
  // the same fallback any unknown token does rather than naming a dead zone.
  assert.equal(COMMAND_CENTER_AREAS.find((area) => area.id === 'power-core'), undefined);
  assert.equal(canonicalAreaId('core'), '');
  assert.equal(canonicalAreaId('power'), '');
  assert.equal(areaIdForWorkflow({ workflow: 'unknown', context: { station: 'core' } }), 'central-operations');

  // D3 kept its id, geometry and triggers — visualMappings addresses it by id — and
  // now belongs to the machine that actually stands under it.
  const d3 = COMMAND_CENTER_CONDUITS.find((conduit) => conduit.id === 'D3');
  assert.equal(d3.zone, 'experiment-bench');
  assert.deepEqual({ x: d3.x, y: d3.y, length: d3.length }, { x: 477, y: 216, length: 48 });
  assert.deepEqual([...d3.triggers], ['evaluating', 'thinking']);

  // And the procedural renderer paths that only the core used are gone with it,
  // rather than surviving as unreachable cases nothing can construct a spec for.
  const scene = fs.readFileSync(`${__dirname}/../src/command-center/CommandCenterScene.mjs`, 'utf8');
  ["case 'core'", "case 'sigil'", "case 'core-seed'", 'part.recessed', 'parts.sigil', 'parts.seed']
    .forEach((needle) => {
      assert.equal(scene.includes(needle), false, `the scene still carries ${needle}`);
    });

  // Nothing anywhere else still names the Power Core's files or keys.
  ['sceneConfig.mjs', 'propSheets.mjs', 'machineConfig.mjs', 'visualMappings.mjs'].forEach((name) => {
    const source = fs.readFileSync(`${__dirname}/../src/command-center/${name}`, 'utf8');
    assert.doesNotMatch(source, /prop_core_well|anim_core_pulse|anim_core_sigil|anim_core_seed/, name);
  });
  const manifest = JSON.parse(
    fs.readFileSync(`${__dirname}/../public/assets/command-center/manifest.json`, 'utf8')
  );
  assert.equal(manifest.files.some((file) => file.includes('core_well')), false);
});
