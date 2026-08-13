const assert = require('node:assert/strict');
const test = require('node:test');

const terminalHandler = require('../api/terminal/signals');
const { _setSqlForTests } = require('../server/terminal/db');
const { createSignal, listSignals } = require('../server/terminal/signals');
const {
  hashSourceUrl,
  normalizeSourceUrl,
  validateListQuery,
  validateTerminalSignalPayload
} = require('../server/terminal/validation');

const originalIngestSecret = process.env.TERMINAL_INGEST_SECRET;
const originalDatabaseUrl = process.env.DATABASE_URL;
let categoryLabel;
let compactSignalTags;
let formatSignalDate;
let relativeSignalTime;
let strengthSummary;

test.before(async () => {
  ({
    categoryLabel,
    compactSignalTags,
    formatSignalDate,
    relativeSignalTime,
    strengthSummary
  } = await import('../src/terminal/viewModel.mjs'));
});

test.afterEach(() => {
  _setSqlForTests(null);

  if (originalIngestSecret === undefined) delete process.env.TERMINAL_INGEST_SECRET;
  else process.env.TERMINAL_INGEST_SECRET = originalIngestSecret;

  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
});

function samplePayload(overrides = {}) {
  return {
    externalId: 'hermes-source-id',
    headline: 'Concise real signal headline',
    summary: 'One to two short sentences describing what actually happened.',
    alchemistTake: 'One short action-oriented sentence for the guild.',
    category: 'AI_TOOL',
    tags: ['ai', 'game-dev'],
    relevantStrengths: ['Builder', 'Researcher'],
    sourceName: 'Original Source',
    sourceUrl: 'https://Example.com/original-source/?utm_source=discord&b=2&a=1#section',
    originalDate: '2026-08-12',
    discoveredAt: '2026-08-12T17:42:00-04:00',
    ...overrides
  };
}

function makeTerminalSqlStore(initialRows = []) {
  const rows = [...initialRows];

  async function sql(strings, ...values) {
    const query = strings.join(' ').replace(/\s+/g, ' ').trim().toLowerCase();

    if (query.includes('select id from signals where source_url_hash')) {
      const [sourceUrlHash, externalId] = values;
      const match = rows.find((row) => {
        return row.source_url_hash === sourceUrlHash || (externalId && row.external_id === externalId);
      });
      return match ? [{ id: match.id }] : [];
    }

    if (query.includes('insert into signals')) {
      const [
        externalId,
        headline,
        summary,
        alchemistTake,
        category,
        tagsJson,
        strengthsJson,
        sourceName,
        sourceUrl,
        sourceUrlHash,
        originalDate,
        discoveredAt
      ] = values;

      const duplicate = rows.find((row) => {
        return row.source_url_hash === sourceUrlHash || (externalId && row.external_id === externalId);
      });

      if (duplicate) return [];

      const row = {
        id: `signal-${rows.length + 1}`,
        external_id: externalId,
        headline,
        summary,
        alchemist_take: alchemistTake,
        category,
        tags: JSON.parse(tagsJson),
        relevant_strengths: JSON.parse(strengthsJson),
        source_name: sourceName,
        source_url: sourceUrl,
        source_url_hash: sourceUrlHash,
        original_date: originalDate,
        discovered_at: discoveredAt,
        created_at: new Date('2026-08-12T22:00:00.000Z').toISOString()
      };

      rows.push(row);
      return [{ id: row.id }];
    }

    if (query.includes('select id, external_id')) {
      const hasCategory = query.includes('where category =');
      const category = hasCategory ? values[0] : null;
      const limit = hasCategory ? values[1] : values[0];

      return rows
        .filter((row) => !category || row.category === category)
        .sort((a, b) => Date.parse(b.discovered_at) - Date.parse(a.discovered_at))
        .slice(0, limit);
    }

    throw new Error(`Unexpected SQL in terminal test: ${query}`);
  }

  return { rows, sql };
}

async function invokeHandler({ method = 'GET', url = '/api/terminal/signals', body, headers = {} } = {}) {
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

  await terminalHandler({
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

test('validates a terminal signal payload and normalizes source URL/hash', () => {
  const signal = validateTerminalSignalPayload(samplePayload());

  assert.equal(signal.externalId, 'hermes-source-id');
  assert.equal(signal.category, 'AI_TOOL');
  assert.deepEqual(signal.relevantStrengths, ['Builder', 'Researcher']);
  assert.deepEqual(signal.tags, ['ai', 'game-dev']);
  assert.equal(signal.sourceUrl, 'https://example.com/original-source?a=1&b=2');
  assert.equal(signal.sourceUrlHash, hashSourceUrl('https://example.com/original-source?b=2&a=1'));
  assert.equal(signal.originalDate, '2026-08-12');
  assert.equal(signal.discoveredAt, '2026-08-12T21:42:00.000Z');
});

test('rejects unsupported fields, categories, strengths, and malformed dates', () => {
  assert.throws(
    () => validateTerminalSignalPayload(samplePayload({ extra: true })),
    /unsupported fields/
  );
  assert.throws(
    () => validateTerminalSignalPayload(samplePayload({ category: 'AI' })),
    /category is not allowed/
  );
  assert.throws(
    () => validateTerminalSignalPayload(samplePayload({ relevantStrengths: ['Builder', 'Builder'] })),
    /duplicate/
  );
  assert.throws(
    () => validateTerminalSignalPayload(samplePayload({ originalDate: '2026-02-31' })),
    /real calendar date/
  );
});

test('normalizes and hashes URLs for tracking-param duplicate detection', () => {
  assert.equal(
    normalizeSourceUrl('https://Example.com/news/?utm_campaign=x&gclid=123#comments'),
    'https://example.com/news'
  );
  assert.equal(
    hashSourceUrl('https://example.com/news?utm_source=discord#fragment'),
    hashSourceUrl('https://example.com/news/')
  );
  assert.notEqual(
    hashSourceUrl('https://example.com/news?id=1'),
    hashSourceUrl('https://example.com/news?id=2')
  );
});

test('validates terminal list query filters', () => {
  assert.deepEqual(validateListQuery({}), { category: null, limit: 25 });
  assert.deepEqual(validateListQuery({ category: 'RESEARCH', limit: '3' }), { category: 'RESEARCH', limit: 3 });
  assert.throws(() => validateListQuery({ limit: '0' }), /between 1 and 60/);
  assert.throws(() => validateListQuery({ category: 'TOOLS' }), /category is not allowed/);
});

test('creates signals and returns duplicate status for matching source hash or external id', async () => {
  const store = makeTerminalSqlStore();
  _setSqlForTests(store.sql);

  const first = validateTerminalSignalPayload(samplePayload());
  const created = await createSignal(first);
  assert.deepEqual(created, { id: 'signal-1', status: 'created' });

  const duplicateByHash = validateTerminalSignalPayload(samplePayload({
    externalId: 'different-id',
    sourceUrl: 'https://example.com/original-source?b=2&a=1&utm_medium=social'
  }));
  const hashResult = await createSignal(duplicateByHash);
  assert.deepEqual(hashResult, { id: 'signal-1', status: 'duplicate' });

  const duplicateByExternalId = validateTerminalSignalPayload(samplePayload({
    sourceUrl: 'https://example.com/another-source'
  }));
  const externalResult = await createSignal(duplicateByExternalId);
  assert.deepEqual(externalResult, { id: 'signal-1', status: 'duplicate' });

  assert.equal(store.rows.length, 1);
});

test('lists signals by discovered date and optional category', async () => {
  const store = makeTerminalSqlStore();
  _setSqlForTests(store.sql);

  await createSignal(validateTerminalSignalPayload(samplePayload({
    externalId: 'old-news',
    category: 'NEWS',
    sourceUrl: 'https://example.com/old-news',
    discoveredAt: '2026-08-11T12:00:00Z'
  })));
  await createSignal(validateTerminalSignalPayload(samplePayload({
    externalId: 'new-research',
    category: 'RESEARCH',
    sourceUrl: 'https://example.com/new-research',
    discoveredAt: '2026-08-12T12:00:00Z'
  })));

  const all = await listSignals({ limit: 2 });
  assert.deepEqual(all.map((signal) => signal.externalId), ['new-research', 'old-news']);

  const research = await listSignals({ category: 'RESEARCH', limit: 10 });
  assert.equal(research.length, 1);
  assert.equal(research[0].category, 'RESEARCH');
});

test('terminal API enforces POST auth and accepts public GET', async () => {
  const store = makeTerminalSqlStore();
  _setSqlForTests(store.sql);
  process.env.TERMINAL_INGEST_SECRET = 'terminal-secret';

  const unauthenticated = await invokeHandler({
    method: 'POST',
    body: samplePayload()
  });
  assert.equal(unauthenticated.statusCode, 401);
  assert.equal(unauthenticated.body.success, false);

  const badToken = await invokeHandler({
    method: 'POST',
    headers: { authorization: 'Bearer wrong-token' },
    body: samplePayload()
  });
  assert.equal(badToken.statusCode, 401);

  const created = await invokeHandler({
    method: 'POST',
    headers: { authorization: 'Bearer terminal-secret' },
    body: samplePayload()
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.body.status, 'created');

  const duplicate = await invokeHandler({
    method: 'POST',
    headers: { authorization: 'Bearer terminal-secret' },
    body: samplePayload({ sourceUrl: 'https://example.com/original-source?utm_source=x&a=1&b=2' })
  });
  assert.equal(duplicate.statusCode, 200);
  assert.equal(duplicate.body.status, 'duplicate');

  const listed = await invokeHandler({
    method: 'GET',
    url: '/api/terminal/signals?limit=1'
  });
  assert.equal(listed.statusCode, 200);
  assert.equal(listed.body.success, true);
  assert.equal(listed.body.count, 1);
});

test('terminal API rejects malformed payloads and unsupported methods', async () => {
  _setSqlForTests(makeTerminalSqlStore().sql);
  process.env.TERMINAL_INGEST_SECRET = 'terminal-secret';

  const malformed = await invokeHandler({
    method: 'POST',
    headers: { authorization: 'Bearer terminal-secret' },
    body: samplePayload({ headline: '' })
  });
  assert.equal(malformed.statusCode, 400);

  const unsupported = await invokeHandler({ method: 'DELETE' });
  assert.equal(unsupported.statusCode, 405);
  assert.equal(unsupported.headers.allow, 'GET, POST, OPTIONS');
});

test('terminal frontend formatting helpers produce stable labels', () => {
  const signal = {
    category: 'AI_TOOL',
    tags: ['ai', 'AI', 'game-dev', 'automation'],
    relevantStrengths: ['Builder', 'Researcher', 'Strategist', 'Creator']
  };

  assert.equal(categoryLabel('AI_TOOL'), 'AI Tool');
  assert.equal(formatSignalDate('2026-08-12'), 'Aug 12, 2026');
  assert.equal(relativeSignalTime('2026-08-12T16:00:00Z', Date.parse('2026-08-12T17:30:00Z')), '1h ago');
  assert.deepEqual(compactSignalTags(signal, 3), ['ai', 'game-dev', 'automation']);
  assert.equal(strengthSummary(signal, 2), 'Builder, Researcher +2');
});
