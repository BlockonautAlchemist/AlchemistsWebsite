#!/usr/bin/env node

const { getSql } = require('../server/terminal/db');
const {
  TERMINAL_CHANNELS,
  TERMINAL_LEGACY_CATEGORY_MIGRATION
} = require('../server/terminal/constants');

const CHECK_CONSTRAINT_NAME = 'signals_category_canonical_check';
const VALID_MODES = new Set(['--check', '--apply']);
const CHANNEL_SET = new Set(TERMINAL_CHANNELS);
const LEGACY_CATEGORIES = Object.keys(TERMINAL_LEGACY_CATEGORY_MIGRATION);

function usage() {
  return [
    'Usage: node --env-file-if-exists=.env.local scripts/migrate-terminal-taxonomy.js --check',
    '       node --env-file-if-exists=.env.local scripts/migrate-terminal-taxonomy.js --apply'
  ].join('\n');
}

function countValue(value) {
  return Number(value || 0);
}

function rowSummary(row) {
  return {
    id: row.id,
    externalId: row.external_id || null,
    category: row.category,
    headline: row.headline,
    tags: Array.isArray(row.tags) ? row.tags : []
  };
}

function checkConstraintSql() {
  const values = TERMINAL_CHANNELS.map((channel) => {
    if (!/^[A-Z_]+$/.test(channel)) {
      throw new Error(`Unsafe channel value in taxonomy: ${channel}`);
    }
    return `'${channel}'`;
  }).join(', ');

  return `ALTER TABLE signals ADD CONSTRAINT ${CHECK_CONSTRAINT_NAME} CHECK (category IN (${values}))`;
}

async function snapshot(sql) {
  const [totalRow] = await sql`
    SELECT count(*)::int AS total
    FROM signals
  `;
  const counts = await sql`
    SELECT category, count(*)::int AS count
    FROM signals
    GROUP BY category
    ORDER BY category ASC
  `;

  return {
    total: countValue(totalRow && totalRow.total),
    counts: Object.fromEntries(counts.map((row) => [row.category, countValue(row.count)]))
  };
}

async function blockingRows(sql) {
  const unmapped = await sql.query(
    `
      SELECT category, count(*)::int AS count
      FROM signals
      WHERE NOT (category = ANY ($1::text[]))
        AND NOT (category = ANY ($2::text[]))
      GROUP BY category
      ORDER BY category ASC
    `,
    [TERMINAL_CHANNELS, LEGACY_CATEGORIES]
  );

  const newsWithoutAiNews = await sql`
    SELECT id, external_id, category, headline, tags
    FROM signals
    WHERE category = 'NEWS'
      AND NOT ('ai-news' = ANY(tags))
    ORDER BY discovered_at DESC
  `;

  const opportunityWithoutPlaybooks = await sql`
    SELECT id, external_id, category, headline, tags
    FROM signals
    WHERE category = 'OPPORTUNITY'
      AND NOT ('playbooks' = ANY(tags))
    ORDER BY discovered_at DESC
  `;

  return {
    unmapped,
    newsWithoutAiNews: newsWithoutAiNews.map(rowSummary),
    opportunityWithoutPlaybooks: opportunityWithoutPlaybooks.map(rowSummary)
  };
}

function assertNoBlockers(blockers) {
  const failures = [];

  if (blockers.unmapped.length) failures.push('unmapped noncanonical categories');
  if (blockers.newsWithoutAiNews.length) failures.push('NEWS rows missing ai-news');
  if (blockers.opportunityWithoutPlaybooks.length) failures.push('OPPORTUNITY rows missing playbooks');

  if (!failures.length) return;

  const error = new Error(`Terminal taxonomy migration blocked: ${failures.join(', ')}.`);
  error.blockers = blockers;
  throw error;
}

async function audit(sql) {
  const current = await snapshot(sql);
  const blockers = await blockingRows(sql);

  return {
    snapshot: current,
    blockers
  };
}

async function applyMigration(sql, before) {
  const updateEntries = Object.entries(TERMINAL_LEGACY_CATEGORY_MIGRATION)
    .filter(([from, to]) => from !== to || !CHANNEL_SET.has(from));

  const transactionResults = await sql.transaction((tx) => [
    ...updateEntries.map(([from, to]) => tx`
      UPDATE signals
      SET category = ${to}
      WHERE category = ${from}
      RETURNING id
    `),
    tx.query(`ALTER TABLE signals DROP CONSTRAINT IF EXISTS ${CHECK_CONSTRAINT_NAME}`),
    tx.query(checkConstraintSql())
  ]);

  const after = await snapshot(sql);
  if (after.total !== before.snapshot.total) {
    throw new Error(`Migration changed row count from ${before.snapshot.total} to ${after.total}.`);
  }

  return {
    updates: updateEntries.map(([from, to], index) => ({
      from,
      to,
      rows: Array.isArray(transactionResults[index]) ? transactionResults[index].length : 0
    })),
    snapshot: after
  };
}

async function main() {
  const mode = process.argv[2];
  if (!VALID_MODES.has(mode) || process.argv.length > 3) {
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  const sql = getSql();
  const before = await audit(sql);
  assertNoBlockers(before.blockers);

  if (mode === '--check') {
    console.log(JSON.stringify({
      ok: true,
      mode,
      ...before
    }, null, 2));
    return;
  }

  const beforeApply = await audit(sql);
  assertNoBlockers(beforeApply.blockers);
  const applied = await applyMigration(sql, beforeApply);

  console.log(JSON.stringify({
    ok: true,
    mode,
    before: beforeApply.snapshot,
    updates: applied.updates,
    after: applied.snapshot,
    rowCountPreserved: beforeApply.snapshot.total === applied.snapshot.total,
    constraint: CHECK_CONSTRAINT_NAME
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    if (error.blockers) console.error(JSON.stringify(error.blockers, null, 2));
    process.exitCode = 1;
  });
}

module.exports = {
  CHECK_CONSTRAINT_NAME,
  audit,
  applyMigration,
  checkConstraintSql
};
