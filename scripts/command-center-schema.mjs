import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

export const COMMAND_CENTER_BASE_MIGRATION = 'migrations/20260820000000_create_command_center.sql';
export const COMMAND_CENTER_RUNS_MIGRATION = 'migrations/20260906000000_command_center_public_runs.sql';
export const COMMAND_CENTER_DIAGNOSTIC_MIGRATION = 'migrations/20260907000000_command_center_diagnostic_cleanup.sql';

const BASE_COLUMNS = Object.freeze({
  command_center_events: Object.freeze([
    'id', 'event_id', 'agent', 'workflow', 'workflow_label', 'state', 'activity',
    'context', 'public_url', 'event_timestamp', 'started_at', 'ttl_seconds',
    'expires_at', 'received_at'
  ]),
  command_center_workflow_state: Object.freeze([
    'agent', 'workflow', 'latest_event_id', 'event_id', 'workflow_label', 'state',
    'activity', 'context', 'public_url', 'event_timestamp', 'started_at',
    'ttl_seconds', 'expires_at', 'updated_at'
  ])
});

const RUN_COLUMNS = Object.freeze({
  command_center_events: Object.freeze(['run_id', 'task_title', 'outcome', 'visibility']),
  command_center_workflow_state: Object.freeze(['run_id', 'task_title', 'outcome', 'visibility'])
});

const RUN_CONSTRAINTS = Object.freeze([
  'command_center_events_visibility_check',
  'command_center_workflow_state_visibility_check'
]);

const RUN_INDEXES = Object.freeze([
  'command_center_events_public_history_idx',
  'command_center_events_public_run_idx',
  'command_center_events_public_started_run_idx'
]);

function setFrom(rows, field) {
  return new Set(rows.map((row) => row[field]));
}

export function schemaSnapshot({
  columns = [], constraints = [], indexes = [], publicDiagnosticEventCount = 0
} = {}) {
  const columnsByTable = new Map();
  columns.forEach(({ table_name: tableName, column_name: columnName }) => {
    if (!columnsByTable.has(tableName)) columnsByTable.set(tableName, new Set());
    columnsByTable.get(tableName).add(columnName);
  });
  return {
    columnsByTable,
    constraints: setFrom(constraints, 'constraint_name'),
    indexes: setFrom(indexes, 'indexname'),
    publicDiagnosticEventCount
  };
}

function missingColumns(snapshot, expected) {
  return Object.entries(expected).flatMap(([tableName, columnNames]) => {
    const actual = snapshot.columnsByTable.get(tableName) || new Set();
    return columnNames
      .filter((columnName) => !actual.has(columnName))
      .map((columnName) => `column ${tableName}.${columnName}`);
  });
}

export function commandCenterSchemaStatus(snapshot) {
  const missingBase = missingColumns(snapshot, BASE_COLUMNS);
  const missingRuns = [
    ...missingColumns(snapshot, RUN_COLUMNS),
    ...RUN_CONSTRAINTS
      .filter((constraint) => !snapshot.constraints.has(constraint))
      .map((constraint) => `constraint ${constraint}`),
    ...RUN_INDEXES
      .filter((index) => !snapshot.indexes.has(index))
      .map((index) => `index ${index}`)
  ];
  const missingDiagnostics = snapshot.publicDiagnosticEventCount > 0
    ? [`${snapshot.publicDiagnosticEventCount} repository-generated diagnostic events are still public`]
    : [];
  const requiredMigrations = [];
  if (missingBase.length) requiredMigrations.push(COMMAND_CENTER_BASE_MIGRATION);
  if (missingRuns.length) requiredMigrations.push(COMMAND_CENTER_RUNS_MIGRATION);
  if (!missingBase.length && !missingRuns.length && missingDiagnostics.length) {
    requiredMigrations.push(COMMAND_CENTER_DIAGNOSTIC_MIGRATION);
  }
  return {
    compatible: requiredMigrations.length === 0,
    missing: [...missingBase, ...missingRuns, ...missingDiagnostics],
    missingBase,
    missingRuns,
    missingDiagnostics,
    requiredMigrations
  };
}

export async function inspectCommandCenterSchema(client) {
  const columns = await client.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name IN ('command_center_events', 'command_center_workflow_state')
    ORDER BY table_name, ordinal_position
  `);
  const constraints = await client.query(`
    SELECT constraint_name
    FROM information_schema.table_constraints
    WHERE table_schema = current_schema()
      AND table_name IN ('command_center_events', 'command_center_workflow_state')
  `);
  const indexes = await client.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename IN ('command_center_events', 'command_center_workflow_state')
  `);
  const hasVisibility = columns.rows.some((row) => (
    row.table_name === 'command_center_events' && row.column_name === 'visibility'
  ));
  let publicDiagnosticEventCount = 0;
  if (hasVisibility) {
    const { rows: [diagnostics] } = await client.query(`
      SELECT count(*)::int AS count
      FROM command_center_events
      WHERE visibility = 'public'
        AND (
          event_id LIKE 'replay-%'
          OR event_id LIKE 'real-baseline-%'
          OR event_id LIKE 'real-cleanup-%'
          OR event_id LIKE 'real-replay-%'
          OR event_id LIKE 'real-supplement-%'
          OR event_id LIKE 'verify-%'
          OR event_id LIKE 'supplement-%'
          OR event_id LIKE 'codex-env-check-%'
          OR workflow = 'fixture'
        )
    `);
    publicDiagnosticEventCount = diagnostics.count;
  }
  return schemaSnapshot({
    columns: columns.rows,
    constraints: constraints.rows,
    indexes: indexes.rows,
    publicDiagnosticEventCount
  });
}

function incompatibleSchemaError(status) {
  const migrationList = status.requiredMigrations.map((migration) => `  - ${migration}`).join('\n');
  const missingList = status.missing.map((artifact) => `  - ${artifact}`).join('\n');
  return new Error(
    `Command Center database schema is incompatible. Apply:\n${migrationList}\nMissing:\n${missingList}`
  );
}

export function assertCommandCenterSchema(status) {
  if (!status.compatible) throw incompatibleSchemaError(status);
}

async function databaseSummary(client) {
  const { rows: [identity] } = await client.query(
    'SELECT current_database() AS database_name, current_schema() AS schema_name'
  );
  const { rows: [counts] } = await client.query(`
    SELECT
      (SELECT count(*)::int FROM command_center_events) AS event_count,
      (SELECT count(*)::int FROM command_center_workflow_state) AS state_count
  `);
  return { ...identity, ...counts };
}

async function assertDerivedState(client) {
  const { rows: [result] } = await client.query(`
    WITH expected_latest AS (
      SELECT DISTINCT ON (agent, workflow) agent, workflow, id
      FROM command_center_events
      WHERE visibility = 'public'
      ORDER BY agent, workflow, event_timestamp DESC,
        COALESCE(event_id, id::text) COLLATE "C" DESC
    ), comparison AS (
      SELECT expected.id AS expected_id, state.latest_event_id AS actual_id
      FROM expected_latest expected
      FULL JOIN command_center_workflow_state state USING (agent, workflow)
    )
    SELECT
      (SELECT count(*)::int FROM command_center_workflow_state) AS actual,
      (SELECT count(*)::int FROM expected_latest) AS expected,
      (SELECT count(*)::int
        FROM comparison
        WHERE expected_id IS DISTINCT FROM actual_id) AS invalid
  `);
  if (result.actual !== result.expected || result.invalid !== 0) {
    throw new Error(
      `Latest-state rebuild is inconsistent (actual=${result.actual}, expected=${result.expected}, invalid=${result.invalid}).`
    );
  }
}

export async function applyCommandCenterMigrations(client, migrationSqlByPath) {
  const beforeStatus = commandCenterSchemaStatus(await inspectCommandCenterSchema(client));
  if (beforeStatus.missingBase.length) throw incompatibleSchemaError(beforeStatus);
  if (beforeStatus.compatible) {
    return { applied: false, summary: await databaseSummary(client) };
  }

  await client.query('BEGIN');
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('alchemists-command-center-schema'))");
    const before = await databaseSummary(client);
    const lockedStatus = commandCenterSchemaStatus(await inspectCommandCenterSchema(client));
    const appliedMigrations = [];
    if (lockedStatus.missingRuns.length) {
      await client.query(migrationSqlByPath[COMMAND_CENTER_RUNS_MIGRATION]);
      appliedMigrations.push(COMMAND_CENTER_RUNS_MIGRATION);
    }
    const afterRunsStatus = commandCenterSchemaStatus(await inspectCommandCenterSchema(client));
    if (afterRunsStatus.missingDiagnostics.length) {
      await client.query(migrationSqlByPath[COMMAND_CENTER_DIAGNOSTIC_MIGRATION]);
      appliedMigrations.push(COMMAND_CENTER_DIAGNOSTIC_MIGRATION);
    }
    const afterStatus = commandCenterSchemaStatus(await inspectCommandCenterSchema(client));
    assertCommandCenterSchema(afterStatus);
    const after = await databaseSummary(client);
    if (after.event_count !== before.event_count) {
      throw new Error(`Migration changed event count from ${before.event_count} to ${after.event_count}.`);
    }
    await assertDerivedState(client);
    await client.query('COMMIT');
    return { applied: appliedMigrations.length > 0, appliedMigrations, before, summary: after };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

function requireDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required. Pull the intended Vercel environment first.');
  return hardenedDatabaseUrl(databaseUrl);
}

export function hardenedDatabaseUrl(databaseUrl) {
  const url = new URL(databaseUrl);
  if (['prefer', 'require', 'verify-ca'].includes(url.searchParams.get('sslmode'))) {
    // pg 8 currently treats these modes as verify-full. Make that secure behavior
    // explicit so the deploy gate will not weaken when pg 9 adopts libpq semantics.
    url.searchParams.set('sslmode', 'verify-full');
  }
  return url.toString();
}

async function withDatabase(callback) {
  const pool = new Pool({
    connectionString: requireDatabaseUrl(),
    max: 1,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000
  });
  let client;
  try {
    client = await pool.connect();
    return await callback(client);
  } finally {
    client?.release();
    await pool.end();
  }
}

async function checkCli() {
  await withDatabase(async (client) => {
    const status = commandCenterSchemaStatus(await inspectCommandCenterSchema(client));
    assertCommandCenterSchema(status);
    const summary = await databaseSummary(client);
    console.log(
      `Command Center schema is compatible (${summary.database_name}.${summary.schema_name}; `
      + `${summary.event_count} events, ${summary.state_count} latest states).`
    );
  });
}

async function migrateCli({ apply = false } = {}) {
  await withDatabase(async (client) => {
    const status = commandCenterSchemaStatus(await inspectCommandCenterSchema(client));
    if (status.missingBase.length) throw incompatibleSchemaError(status);
    if (status.compatible) {
      const summary = await databaseSummary(client);
      console.log(
        `Command Center schema is already compatible (${summary.database_name}.${summary.schema_name}; `
        + `${summary.event_count} events, ${summary.state_count} latest states).`
      );
      return;
    }
    if (!apply) {
      throw new Error(
        `Migration required:\n${status.requiredMigrations.map((migration) => `  - ${migration}`).join('\n')}`
        + '\nRe-run with "--apply" after confirming the target environment.'
      );
    }
    const migrationSqlByPath = Object.fromEntries(await Promise.all(
      [COMMAND_CENTER_RUNS_MIGRATION, COMMAND_CENTER_DIAGNOSTIC_MIGRATION].map(async (migration) => [
        migration,
        await readFile(new URL(`../${migration}`, import.meta.url), 'utf8')
      ])
    ));
    const result = await applyCommandCenterMigrations(client, migrationSqlByPath);
    console.log(
      `Applied ${result.appliedMigrations.join(', ')} to ${result.summary.database_name}.${result.summary.schema_name}; `
      + `preserved ${result.summary.event_count} events and rebuilt ${result.summary.state_count} latest states.`
    );
  });
}

async function main(argv) {
  const [command, ...flags] = argv;
  if (command === 'check') return checkCli();
  if (command === 'migrate') return migrateCli({ apply: flags.includes('--apply') });
  throw new Error('Usage: node scripts/command-center-schema.mjs <check|migrate> [--apply]');
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (invokedPath === import.meta.url) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
