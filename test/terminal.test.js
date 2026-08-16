const assert = require('node:assert/strict');
const test = require('node:test');

const terminalHandler = require('../api/terminal/signals');
const { _setSqlForTests } = require('../server/terminal/db');
const { createSignal, listSignals } = require('../server/terminal/signals');
const {
  TERMINAL_CHANNEL_LABELS,
  TERMINAL_CHANNELS,
  TERMINAL_LEGACY_CATEGORY_MIGRATION
} = require('../server/terminal/constants');
const {
  hashSourceUrl,
  normalizeSourceUrl,
  validateListQuery,
  validateTerminalSignalPayload
} = require('../server/terminal/validation');
const { checkConstraintSql } = require('../scripts/migrate-terminal-taxonomy');

const originalIngestSecret = process.env.TERMINAL_INGEST_SECRET;
const originalDatabaseUrl = process.env.DATABASE_URL;
let categoryLabel;
let compactSignalTags;
let formatOptionalSignalDate;
let formatSignalDate;
let normalizeTerminalChannel;
let relativeSignalTime;
let signalProvenanceParts;
let strengthSummary;
let terminalChannelState;
let terminalSignalsUrl;
let terminalUrlWithChannel;
let viewModelTerminalCategories;
let viewModelTerminalChannels;

test.before(async () => {
  ({
    TERMINAL_CATEGORIES: viewModelTerminalCategories,
    TERMINAL_CHANNELS: viewModelTerminalChannels,
    categoryLabel,
    compactSignalTags,
    formatOptionalSignalDate,
    formatSignalDate,
    normalizeTerminalChannel,
    relativeSignalTime,
    signalProvenanceParts,
    strengthSummary,
    terminalChannelState,
    terminalSignalsUrl,
    terminalUrlWithChannel
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
    category: 'AI_TOOLS',
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
  assert.equal(signal.category, 'AI_TOOLS');
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
    () => validateTerminalSignalPayload(samplePayload({ category: 'AI_TOOL' })),
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
  assert.deepEqual(validateListQuery({}), { channel: null, limit: 25 });
  assert.deepEqual(validateListQuery({ channel: 'RESEARCH', limit: '3' }), { channel: 'RESEARCH', limit: 3 });
  assert.throws(() => validateListQuery({ limit: '0' }), /between 1 and 60/);
  assert.throws(() => validateListQuery({ category: 'RESEARCH' }), /category filter is not supported/);
  assert.throws(() => validateListQuery({ channel: 'AI_TOOL' }), /channel is not allowed/);
  assert.throws(() => validateListQuery({ channel: 'TOOLS' }), /channel is not allowed/);
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
    externalId: 'industry-signal',
    category: 'INDUSTRY',
    sourceUrl: 'https://example.com/industry-signal',
    discoveredAt: '2026-08-11T12:00:00Z'
  })));
  await createSignal(validateTerminalSignalPayload(samplePayload({
    externalId: 'new-research',
    category: 'RESEARCH',
    sourceUrl: 'https://example.com/new-research',
    discoveredAt: '2026-08-12T12:00:00Z'
  })));

  const all = await listSignals({ limit: 2 });
  assert.deepEqual(all.map((signal) => signal.externalId), ['new-research', 'industry-signal']);

  const research = await listSignals({ channel: 'RESEARCH', limit: 10 });
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
    url: '/api/terminal/signals?channel=AI_TOOLS&limit=1'
  });
  assert.equal(listed.statusCode, 200);
  assert.equal(listed.body.success, true);
  assert.equal(listed.body.count, 1);
  assert.equal(listed.body.signals[0].category, 'AI_TOOLS');

  const deprecatedFilter = await invokeHandler({
    method: 'GET',
    url: '/api/terminal/signals?category=AI_TOOLS'
  });
  assert.equal(deprecatedFilter.statusCode, 400);

  const unknownChannel = await invokeHandler({
    method: 'GET',
    url: '/api/terminal/signals?channel=AI_TOOL'
  });
  assert.equal(unknownChannel.statusCode, 400);
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

  const deprecatedCategory = await invokeHandler({
    method: 'POST',
    headers: { authorization: 'Bearer terminal-secret' },
    body: samplePayload({ category: 'AI_TOOL' })
  });
  assert.equal(deprecatedCategory.statusCode, 400);

  const unsupported = await invokeHandler({ method: 'DELETE' });
  assert.equal(unsupported.statusCode, 405);
  assert.equal(unsupported.headers.allow, 'GET, POST, OPTIONS');
});

test('terminal taxonomy exposes canonical channels, labels, and migration mapping', () => {
  const canonical = [
    'AI_TOOLS',
    'GAME_DEV',
    'CREATOR_ECONOMY',
    'PLATFORMS',
    'MONETIZATION',
    'RESEARCH',
    'EXPERIMENTS',
    'INDUSTRY'
  ];

  assert.deepEqual(TERMINAL_CHANNELS, canonical);
  assert.deepEqual(viewModelTerminalChannels, canonical);
  assert.deepEqual(viewModelTerminalCategories, canonical);
  assert.equal(TERMINAL_CHANNEL_LABELS.AI_TOOLS, 'AI TOOLS');
  assert.equal(TERMINAL_CHANNEL_LABELS.CREATOR_ECONOMY, 'CREATOR ECONOMY');
  assert.equal(TERMINAL_CHANNEL_LABELS.MONETIZATION, 'MONETIZATION');
  assert.equal(TERMINAL_CHANNELS.includes('AI_TOOL'), false);
  assert.equal(Object.values(TERMINAL_CHANNEL_LABELS).includes('Money'), false);

  assert.deepEqual(TERMINAL_LEGACY_CATEGORY_MIGRATION, {
    AI_TOOL: 'AI_TOOLS',
    GAME_DEV: 'GAME_DEV',
    CREATOR_TOOL: 'CREATOR_ECONOMY',
    MONEY: 'MONETIZATION',
    PLATFORM: 'PLATFORMS',
    OPPORTUNITY: 'INDUSTRY',
    RESEARCH: 'RESEARCH',
    EXPERIMENT: 'EXPERIMENTS',
    NEWS: 'INDUSTRY'
  });

  const constraint = checkConstraintSql();
  assert.match(constraint, /signals_category_canonical_check/);
  assert.match(constraint, /'AI_TOOLS'/);
  assert.match(constraint, /'CREATOR_ECONOMY'/);
  assert.equal(constraint.includes("'AI_TOOL'"), false);
});

test('terminal frontend formatting helpers produce stable labels', () => {
  const signal = {
    category: 'AI_TOOLS',
    tags: ['ai', 'AI', 'game-dev', 'automation'],
    relevantStrengths: ['Builder', 'Researcher', 'Strategist', 'Creator']
  };

  assert.equal(categoryLabel('AI_TOOLS'), 'AI TOOLS');
  assert.equal(categoryLabel('CREATOR_ECONOMY'), 'CREATOR ECONOMY');
  assert.equal(categoryLabel('MONETIZATION'), 'MONETIZATION');
  assert.equal(formatOptionalSignalDate('2026-08-12'), 'Aug 12, 2026');
  assert.equal(formatOptionalSignalDate('2026-08-12T16:00:00Z'), 'Aug 12, 2026');
  assert.equal(formatOptionalSignalDate(''), '');
  assert.equal(formatOptionalSignalDate('not-a-date'), '');
  assert.equal(formatOptionalSignalDate('2026-13-40'), '');
  assert.equal(formatSignalDate('2026-08-12'), 'Aug 12, 2026');
  assert.equal(formatSignalDate('not-a-date'), 'Unknown date');
  assert.equal(relativeSignalTime('2026-08-12T16:00:00Z', Date.parse('2026-08-12T17:30:00Z')), '1h ago');
  assert.deepEqual(compactSignalTags(signal, 3), ['ai', 'game-dev', 'automation']);
  assert.equal(strengthSummary(signal, 2), 'Builder, Researcher +2');
});

test('terminal frontend channel helpers normalize selected filters and URLs', () => {
  assert.equal(normalizeTerminalChannel('CREATOR_ECONOMY'), 'CREATOR_ECONOMY');
  assert.equal(normalizeTerminalChannel('AI_TOOL'), '');
  assert.deepEqual(terminalChannelState('?channel=MONETIZATION'), {
    channel: 'MONETIZATION',
    hasDeprecatedCategory: false,
    rawChannel: 'MONETIZATION',
    isUnknownChannel: false
  });
  assert.deepEqual(terminalChannelState('?channel=AI_TOOL'), {
    channel: '',
    hasDeprecatedCategory: false,
    rawChannel: 'AI_TOOL',
    isUnknownChannel: true
  });
  assert.deepEqual(terminalChannelState('?category=AI_TOOLS'), {
    channel: '',
    hasDeprecatedCategory: true,
    rawChannel: '',
    isUnknownChannel: false
  });

  const terminalUrl = terminalUrlWithChannel(
    'https://www.gamingalchemists.com/terminal?category=AI_TOOL&view=compact',
    'CREATOR_ECONOMY'
  );
  assert.equal(terminalUrl.pathname, '/terminal');
  assert.equal(terminalUrl.searchParams.get('channel'), 'CREATOR_ECONOMY');
  assert.equal(terminalUrl.searchParams.get('category'), null);
  assert.equal(terminalUrl.searchParams.get('view'), 'compact');

  const allUrl = terminalUrlWithChannel('https://www.gamingalchemists.com/terminal?channel=MONETIZATION', '');
  assert.equal(allUrl.searchParams.get('channel'), null);

  const apiUrl = terminalSignalsUrl('https://www.gamingalchemists.com', {
    channel: 'MONETIZATION',
    limit: 50
  });
  assert.equal(apiUrl.toString(), 'https://www.gamingalchemists.com/api/terminal/signals?limit=50&channel=MONETIZATION');

  const unknownApiUrl = terminalSignalsUrl('https://www.gamingalchemists.com', {
    channel: 'AI_TOOL',
    limit: 50
  });
  assert.equal(unknownApiUrl.toString(), 'https://www.gamingalchemists.com/api/terminal/signals?limit=50');
});

test('terminal signal provenance helper produces source date labels only', () => {
  assert.deepEqual(signalProvenanceParts({
    originalDate: '2026-08-15',
    discoveredAt: '2026-08-16T03:20:00Z'
  }), ['Published Aug 15, 2026', 'Discovered Aug 16, 2026']);

  const missingOriginal = signalProvenanceParts({
    originalDate: 'not-a-date',
    discoveredAt: '2026-08-16T03:20:00Z'
  });
  assert.deepEqual(missingOriginal, ['Discovered Aug 16, 2026']);

  assert.deepEqual(signalProvenanceParts({
    originalDate: '',
    discoveredAt: 'not-a-date'
  }), []);

  assert.equal(missingOriginal.join(' ').includes('Verified'), false);
});
