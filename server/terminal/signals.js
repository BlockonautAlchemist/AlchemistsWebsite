const { getSql } = require('./db');
const { TERMINAL_DEFAULT_SORT } = require('./constants');

function parsePgArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'string') return [];
  if (!value.startsWith('{') || !value.endsWith('}')) return [];

  return value
    .slice(1, -1)
    .split(',')
    .map((entry) => entry.replace(/^"|"$/g, '').replace(/\\"/g, '"').trim())
    .filter(Boolean);
}

function dateOnly(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value || '').slice(0, 10);
}

function isoDateTime(value) {
  if (value instanceof Date) return value.toISOString();

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? String(value || '') : new Date(timestamp).toISOString();
}

function escapeLikePattern(value) {
  return String(value || '').replace(/[\\%_]/g, '\\$&');
}

function searchPatterns(q) {
  const terms = String(q || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return terms.map((term) => `%${escapeLikePattern(term)}%`);
}

function toApiSignal(row) {
  return {
    id: row.id,
    externalId: row.external_id || null,
    headline: row.headline,
    summary: row.summary,
    alchemistTake: row.alchemist_take,
    category: row.category,
    tags: parsePgArray(row.tags),
    relevantStrengths: parsePgArray(row.relevant_strengths),
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    originalDate: dateOnly(row.original_date),
    discoveredAt: isoDateTime(row.discovered_at),
    createdAt: isoDateTime(row.created_at)
  };
}

async function findDuplicateSignal(sql, signal) {
  if (signal.externalId) {
    const rows = await sql`
      SELECT id
      FROM signals
      WHERE source_url_hash = ${signal.sourceUrlHash}
        OR external_id = ${signal.externalId}
      ORDER BY created_at ASC
      LIMIT 1
    `;
    return rows[0] || null;
  }

  const rows = await sql`
    SELECT id
    FROM signals
    WHERE source_url_hash = ${signal.sourceUrlHash}
    ORDER BY created_at ASC
    LIMIT 1
  `;
  return rows[0] || null;
}

async function createSignal(signal) {
  const sql = getSql();
  const duplicate = await findDuplicateSignal(sql, signal);

  if (duplicate) {
    return { id: duplicate.id, status: 'duplicate' };
  }

  const tagsJson = JSON.stringify(signal.tags);
  const strengthsJson = JSON.stringify(signal.relevantStrengths);
  const rows = await sql`
    INSERT INTO signals (
      external_id,
      headline,
      summary,
      alchemist_take,
      category,
      tags,
      relevant_strengths,
      source_name,
      source_url,
      source_url_hash,
      original_date,
      discovered_at
    )
    VALUES (
      ${signal.externalId},
      ${signal.headline},
      ${signal.summary},
      ${signal.alchemistTake},
      ${signal.category},
      (SELECT ARRAY(SELECT jsonb_array_elements_text(${tagsJson}::jsonb))),
      (SELECT ARRAY(SELECT jsonb_array_elements_text(${strengthsJson}::jsonb))),
      ${signal.sourceName},
      ${signal.sourceUrl},
      ${signal.sourceUrlHash},
      ${signal.originalDate},
      ${signal.discoveredAt}
    )
    ON CONFLICT DO NOTHING
    RETURNING id
  `;

  if (rows[0]) {
    return { id: rows[0].id, status: 'created' };
  }

  const racedDuplicate = await findDuplicateSignal(sql, signal);
  if (racedDuplicate) {
    return { id: racedDuplicate.id, status: 'duplicate' };
  }

  throw new Error('Signal insert was not persisted.');
}

async function listSignals({ channel = null, limit = 25, sort = TERMINAL_DEFAULT_SORT, q = '' } = {}) {
  if (sort !== TERMINAL_DEFAULT_SORT) {
    throw new Error(`Unsupported Terminal signal sort: ${sort}`);
  }

  const sql = getSql();
  const patternsJson = JSON.stringify(searchPatterns(q));
  const rows = await sql`
    SELECT
      id,
      external_id,
      headline,
      summary,
      alchemist_take,
      category,
      tags,
      relevant_strengths,
      source_name,
      source_url,
      original_date,
      discovered_at,
      created_at
    FROM signals
    WHERE (${channel}::text IS NULL OR category = ${channel})
      AND (
        ${patternsJson}::jsonb = '[]'::jsonb
        OR NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(${patternsJson}::jsonb) AS search_terms(pattern)
          WHERE NOT (
            COALESCE(headline, '') ILIKE search_terms.pattern ESCAPE '\\'
            OR COALESCE(summary, '') ILIKE search_terms.pattern ESCAPE '\\'
            OR COALESCE(alchemist_take, '') ILIKE search_terms.pattern ESCAPE '\\'
            OR COALESCE(source_name, '') ILIKE search_terms.pattern ESCAPE '\\'
            OR EXISTS (
              SELECT 1
              FROM unnest(COALESCE(tags, ARRAY[]::text[])) AS signal_tags(tag)
              WHERE signal_tags.tag ILIKE search_terms.pattern ESCAPE '\\'
            )
          )
        )
      )
    ORDER BY discovered_at DESC, created_at DESC, id DESC
    LIMIT ${limit}
  `;

  return rows.map(toApiSignal);
}

module.exports = {
  createSignal,
  listSignals,
  searchPatterns,
  toApiSignal
};
