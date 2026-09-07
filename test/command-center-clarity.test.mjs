import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';
import { COMMAND_CENTER_MACHINES } from '../src/command-center/machineConfig.mjs';
import { normalizePublicState } from '../src/command-center/stateModel.mjs';
import { presentCommandCenterState } from '../src/command-center/presentationModel.mjs';

const require = createRequire(import.meta.url);
const { groupPublicEventsIntoRuns } = require('../server/command-center/telemetry');
const { validateHistoryQuery, validateTelemetryPayload } = require('../server/command-center/validation');
const now = Date.parse('2026-09-06T16:00:00.000Z');
const entry = (overrides = {}) => ({
  id: 'e1', eventId: 'e1', agent: 'spawncamper9000', workflow: 'ai-news', workflowLabel: 'AI News',
  runId: 'run-1', taskTitle: 'Review today’s AI news', state: 'researching', activity: 'Reviewing sources',
  timestamp: new Date(now - 1000).toISOString(), startedAt: new Date(now - 5000).toISOString(),
  ttlSeconds: 900, expiresAt: new Date(now + 899000).toISOString(), context: {}, ...overrides
});
const state = (workflows = [], recentHistory = workflows) => normalizePublicState({
  success: true, fetchedAt: new Date(now).toISOString(), workflows, recentHistory
}, now);

test('presentation separates connection, current task state, and truthful narration', () => {
  let view = presentCommandCenterState(state(), { connection: 'connected' });
  assert.equal(view.taskState, 'idle');
  assert.equal(view.narration, 'I’m not running a public task right now.');

  view = presentCommandCenterState(state([entry()]), { connection: 'connected' });
  assert.equal(view.taskState, 'running');
  assert.equal(view.narration, 'I’m working on Review today’s AI news.');
  assert.equal(view.currentTaskCount, 1);

  view = presentCommandCenterState(state([entry({ state: 'waiting', activity: 'Waiting for source confirmation' })]), { connection: 'connected' });
  assert.equal(view.taskState, 'waiting');
  assert.equal(view.step, 'Waiting for source confirmation');

  view = presentCommandCenterState(state([entry()]), { connection: 'disconnected' });
  assert.equal(view.taskState, 'unknown');
  assert.equal(view.narration, 'Current activity cannot be confirmed.');
  assert.equal(presentCommandCenterState(state([entry()]), { connection: 'live' }).taskState, 'running');
});

test('terminal facts endure while animation acknowledgement and expired current work settle', () => {
  const oldComplete = state([entry({ state: 'complete', timestamp: new Date(now - 3600000).toISOString(), expiresAt: new Date(now - 3599000).toISOString(), outcome: 'Three findings recorded' })]);
  assert.equal(oldComplete.workflows[0].taskState, 'completed');
  assert.equal(oldComplete.workflows[0].freshness, 'not_applicable');
  assert.equal(oldComplete.workflows[0].displayState, 'idle');
  assert.equal(presentCommandCenterState(oldComplete, { connection: 'connected' }).taskState, 'idle');
  assert.equal(presentCommandCenterState(oldComplete, { connection: 'connected' }).latestCompleted.outcome, 'Three findings recorded');

  const expired = state([entry({ expiresAt: new Date(now - 1).toISOString() })]);
  assert.equal(expired.workflows[0].taskState, 'unknown');
  assert.equal(expired.workflows[0].lastKnownState, 'researching');
  assert.equal(expired.workflows[0].freshness, 'expired');
  assert.equal(presentCommandCenterState(expired, { connection: 'connected' }).taskState, 'unknown');

  const freshComplete = state([entry({ state: 'complete', timestamp: new Date(now - 1000).toISOString(), outcome: 'Done' })]);
  assert.equal(presentCommandCenterState(freshComplete, { connection: 'connected' }).taskState, 'completed');
  const failure = state([entry({ state: 'error', timestamp: new Date(now - 1000).toISOString(), outcome: 'No output created' })]);
  assert.equal(presentCommandCenterState(failure, { connection: 'connected' }).taskState, 'failed');
});

test('presentation retains concurrent work while selecting one deterministic foreground task', () => {
  const normalized = state([
    entry(),
    entry({ id: 'e2', eventId: 'e2', runId: 'run-2', workflow: 'github', workflowLabel: 'GitHub', state: 'coding', activity: 'Reviewing repository signals', timestamp: new Date(now - 500).toISOString() })
  ]);
  const view = presentCommandCenterState(normalized, { connection: 'connected' });
  assert.equal(view.currentTaskCount, 2);
  assert.equal(view.focus.workflow, 'github');
});

test('run history groups only stable identities and keeps legacy terminal events standalone', () => {
  const events = [
    entry({ id: 'a', eventId: 'a', runId: 'stable', timestamp: new Date(now - 5000).toISOString() }),
    entry({ id: 'b', eventId: 'b', runId: 'stable', state: 'complete', timestamp: new Date(now - 4000).toISOString() }),
    entry({ id: 'c', eventId: 'c', runId: null, startedAt: '2026-09-06T15:00:00Z', timestamp: new Date(now - 3000).toISOString() }),
    entry({ id: 'd', eventId: 'd', runId: null, startedAt: '2026-09-06T15:00:00Z', state: 'complete', timestamp: new Date(now - 2000).toISOString() }),
    entry({ id: 'legacy-active', eventId: null, runId: null, startedAt: null, timestamp: new Date(now - 1200).toISOString() }),
    entry({ id: 'legacy-done-1', eventId: null, runId: null, startedAt: null, state: 'complete', timestamp: new Date(now - 1100).toISOString() }),
    entry({ id: 'legacy-done-2', eventId: null, runId: null, startedAt: null, state: 'complete', timestamp: new Date(now - 1000).toISOString() })
  ];
  const runs = groupPublicEventsIntoRuns(events, { now });
  assert.equal(runs.length, 4);
  assert.deepEqual(runs.map((run) => run.totalEventCount).sort(), [1, 1, 2, 2]);
  assert.equal(runs.some((run) => run.events.some((event) => event.id === 'legacy-active')), false);
});

test('run event display collapses only consecutive identical transitions', () => {
  const common = { runId: 'dedupe' };
  const runs = groupPublicEventsIntoRuns([
    entry({ ...common, id: 'a', eventId: 'a', activity: 'Scan', timestamp: new Date(now - 4000).toISOString() }),
    entry({ ...common, id: 'b', eventId: 'b', activity: 'Scan', timestamp: new Date(now - 3000).toISOString() }),
    entry({ ...common, id: 'c', eventId: 'c', activity: 'Compare', timestamp: new Date(now - 2000).toISOString() }),
    entry({ ...common, id: 'd', eventId: 'd', activity: 'Scan', timestamp: new Date(now - 1000).toISOString() })
  ], { now });
  assert.equal(runs[0].totalEventCount, 4);
  assert.deepEqual(runs[0].events.map((event) => event.occurrenceCount), [2, 1, 1]);
});

test('run details are capped with disclosure and optional outcome/output stay absent', () => {
  const events = Array.from({ length: 25 }, (_, index) => entry({
    id: `cap-${String(index).padStart(2, '0')}`, eventId: `cap-${String(index).padStart(2, '0')}`,
    runId: 'capped-run', activity: `Transition ${index}`, outcome: null, publicUrl: null,
    timestamp: new Date(now - (25 - index) * 1000).toISOString()
  }));
  const run = groupPublicEventsIntoRuns(events, { now })[0];
  assert.equal(run.totalEventCount, 25);
  assert.equal(run.events.length, 20);
  assert.equal(run.omittedEventCount, 5);
  assert.equal(run.outcome, null);
  assert.equal(run.publicUrl, null);
});

test('diagnostic events are excluded and new ingest metadata is strictly validated', () => {
  assert.equal(groupPublicEventsIntoRuns([entry({ visibility: 'diagnostic', state: 'complete' })]).length, 0);
  const telemetry = validateTelemetryPayload({
    workflow: 'ai-news', state: 'complete', activity: 'Finished', runId: 'Run-A',
    taskTitle: 'Daily scan', outcome: 'Two findings', visibility: 'diagnostic'
  }, { now });
  assert.equal(telemetry.runId, 'Run-A');
  assert.equal(telemetry.visibility, 'diagnostic');
  assert.throws(() => validateTelemetryPayload({ workflow: 'ai-news', state: 'complete', activity: 'Finished', visibility: 'private' }, { now }), /public or diagnostic/);
  assert.throws(() => validateHistoryQuery({ cursor: 'not-a-real-cursor' }), /cursor is invalid/);
});

test('machine catalog carries verified purpose and input-work-output copy for every machine', () => {
  assert.equal(COMMAND_CENTER_MACHINES.length, 12);
  COMMAND_CENTER_MACHINES.forEach((machine) => {
    for (const field of ['purpose', 'input', 'work', 'output']) assert.ok(machine[field], `${machine.id}.${field}`);
  });
  assert.deepEqual(COMMAND_CENTER_MACHINES.find((machine) => machine.id === 'news-array').workflows, ['ai-news']);
  assert.deepEqual(COMMAND_CENTER_MACHINES.find((machine) => machine.id === 'opportunity-radar').workflows, ['opportunity-scout']);
});

test('canonical workflow labels override producer display copy in current state and run history', () => {
  const normalized = state([entry({ workflow: 'social-x', workflowLabel: 'X Highlights' })]);
  assert.equal(normalized.workflows[0].workflowLabel, 'X / Social');

  const [run] = groupPublicEventsIntoRuns([
    entry({ workflow: 'github', workflowLabel: 'GitHub Watch', state: 'complete' })
  ], { now });
  assert.equal(run.workflowLabel, 'GitHub');
});

test('additive migration classifies diagnostics and rebuilds public latest state without deleting events', () => {
  const sql = fs.readFileSync(new URL('../migrations/20260906000000_command_center_public_runs.sql', import.meta.url), 'utf8');
  const cleanupSql = fs.readFileSync(new URL('../migrations/20260907000000_command_center_diagnostic_cleanup.sql', import.meta.url), 'utf8');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS run_id/);
  assert.match(sql, /workflow = 'fixture'/);
  assert.match(sql, /event_id LIKE 'real-baseline-%'/);
  assert.match(sql, /event_id LIKE 'verify-%'/);
  assert.match(sql, /DELETE FROM command_center_workflow_state/);
  assert.doesNotMatch(sql, /DELETE FROM command_center_events/);
  assert.match(cleanupSql, /event_id LIKE 'supplement-%'/);
  assert.match(cleanupSql, /DELETE FROM command_center_workflow_state/);
  assert.doesNotMatch(cleanupSql, /DELETE FROM command_center_events/);
});
