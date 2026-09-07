import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMMAND_CENTER_BASE_MIGRATION,
  COMMAND_CENTER_DIAGNOSTIC_MIGRATION,
  COMMAND_CENTER_RUNS_MIGRATION,
  assertCommandCenterSchema,
  commandCenterSchemaStatus,
  hardenedDatabaseUrl,
  schemaSnapshot
} from '../scripts/command-center-schema.mjs';

const baseColumns = {
  command_center_events: [
    'id', 'event_id', 'agent', 'workflow', 'workflow_label', 'state', 'activity',
    'context', 'public_url', 'event_timestamp', 'started_at', 'ttl_seconds',
    'expires_at', 'received_at'
  ],
  command_center_workflow_state: [
    'agent', 'workflow', 'latest_event_id', 'event_id', 'workflow_label', 'state',
    'activity', 'context', 'public_url', 'event_timestamp', 'started_at',
    'ttl_seconds', 'expires_at', 'updated_at'
  ]
};

function columns(extra = {}) {
  return Object.entries(baseColumns).flatMap(([tableName, names]) => (
    [...names, ...(extra[tableName] || [])].map((columnName) => ({
      table_name: tableName,
      column_name: columnName
    }))
  ));
}

test('schema guard identifies missing base schema', () => {
  const status = commandCenterSchemaStatus(schemaSnapshot());
  assert.equal(status.compatible, false);
  assert.deepEqual(status.requiredMigrations, [
    COMMAND_CENTER_BASE_MIGRATION,
    COMMAND_CENTER_RUNS_MIGRATION
  ]);
  assert.throws(() => assertCommandCenterSchema(status), /create_command_center\.sql/);
});

test('database connection keeps pg certificate verification explicit', () => {
  const hardened = hardenedDatabaseUrl('postgresql://user:pass@example.com/db?sslmode=require');
  assert.equal(new URL(hardened).searchParams.get('sslmode'), 'verify-full');
  const local = hardenedDatabaseUrl('postgresql://user:pass@localhost/db?sslmode=disable');
  assert.equal(new URL(local).searchParams.get('sslmode'), 'disable');
});

test('schema guard points base-only databases at the additive run migration', () => {
  const status = commandCenterSchemaStatus(schemaSnapshot({ columns: columns() }));
  assert.equal(status.compatible, false);
  assert.deepEqual(status.requiredMigrations, [COMMAND_CENTER_RUNS_MIGRATION]);
  assert.deepEqual(status.missingBase, []);
  assert.ok(status.missingRuns.includes('column command_center_events.visibility'));
  assert.ok(status.missingRuns.includes('index command_center_events_public_history_idx'));
});

test('schema guard accepts the complete command center contract', () => {
  const runColumns = ['run_id', 'task_title', 'outcome', 'visibility'];
  const status = commandCenterSchemaStatus(schemaSnapshot({
    columns: columns({
      command_center_events: runColumns,
      command_center_workflow_state: runColumns
    }),
    constraints: [
      { constraint_name: 'command_center_events_visibility_check' },
      { constraint_name: 'command_center_workflow_state_visibility_check' }
    ],
    indexes: [
      { indexname: 'command_center_events_public_history_idx' },
      { indexname: 'command_center_events_public_run_idx' },
      { indexname: 'command_center_events_public_started_run_idx' }
    ]
  }));
  assert.deepEqual(status, {
    compatible: true,
    missing: [],
    missingBase: [],
    missingRuns: [],
    missingDiagnostics: [],
    requiredMigrations: []
  });
  assert.doesNotThrow(() => assertCommandCenterSchema(status));
});

test('schema guard blocks public repository verification data', () => {
  const runColumns = ['run_id', 'task_title', 'outcome', 'visibility'];
  const status = commandCenterSchemaStatus(schemaSnapshot({
    columns: columns({
      command_center_events: runColumns,
      command_center_workflow_state: runColumns
    }),
    constraints: [
      { constraint_name: 'command_center_events_visibility_check' },
      { constraint_name: 'command_center_workflow_state_visibility_check' }
    ],
    indexes: [
      { indexname: 'command_center_events_public_history_idx' },
      { indexname: 'command_center_events_public_run_idx' },
      { indexname: 'command_center_events_public_started_run_idx' }
    ],
    publicDiagnosticEventCount: 225
  }));
  assert.equal(status.compatible, false);
  assert.deepEqual(status.requiredMigrations, [COMMAND_CENTER_DIAGNOSTIC_MIGRATION]);
  assert.deepEqual(status.missingDiagnostics, [
    '225 repository-generated diagnostic events are still public'
  ]);
});
