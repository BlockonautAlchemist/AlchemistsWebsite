const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const terminalHandler = require('../api/terminal/signals');
const { _setSqlForTests } = require('../server/terminal/db');
const { createSignal, listSignals, searchPatterns } = require('../server/terminal/signals');
const {
  TERMINAL_CHANNEL_LABELS,
  TERMINAL_CHANNELS,
  TERMINAL_DEFAULT_SORT,
  TERMINAL_LEGACY_CATEGORY_MIGRATION,
  TERMINAL_SORT_OPTIONS,
  TERMINAL_SORTS
} = require('../server/terminal/constants');
const {
  hashSourceUrl,
  normalizeSearchQuery,
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
let normalizeTerminalSearchQuery;
let normalizeTerminalSort;
let relativeSignalTime;
let signalProvenanceParts;
let strengthSummary;
let terminalChannelState;
let terminalFeedState;
let terminalSignalsUrl;
let terminalUrlWithChannel;
let terminalUrlWithSearch;
let terminalUrlWithSort;
let terminalUrlWithState;
let viewModelTerminalCategories;
let viewModelTerminalChannels;
let viewModelTerminalDefaultSort;
let viewModelTerminalSortOptions;
let viewModelTerminalSorts;

test.before(async () => {
  ({
    TERMINAL_CATEGORIES: viewModelTerminalCategories,
    TERMINAL_CHANNELS: viewModelTerminalChannels,
    TERMINAL_DEFAULT_SORT: viewModelTerminalDefaultSort,
    TERMINAL_SORT_OPTIONS: viewModelTerminalSortOptions,
    TERMINAL_SORTS: viewModelTerminalSorts,
    categoryLabel,
    compactSignalTags,
    formatOptionalSignalDate,
    formatSignalDate,
    normalizeTerminalChannel,
    normalizeTerminalSearchQuery,
    normalizeTerminalSort,
    relativeSignalTime,
    signalProvenanceParts,
    strengthSummary,
    terminalChannelState,
    terminalFeedState,
    terminalSignalsUrl,
    terminalUrlWithChannel,
    terminalUrlWithSearch,
    terminalUrlWithSort,
    terminalUrlWithState
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

function sampleDbRow(overrides = {}) {
  return {
    id: 'signal-1',
    external_id: 'sample-signal',
    headline: 'Concise real signal headline',
    summary: 'One to two short sentences describing what actually happened.',
    alchemist_take: 'One short action-oriented sentence for the guild.',
    category: 'AI_TOOLS',
    tags: ['ai', 'game-dev'],
    relevant_strengths: ['Builder', 'Researcher'],
    source_name: 'Original Source',
    source_url: 'https://example.com/original-source',
    source_url_hash: 'sample-source-hash',
    original_date: '2026-08-12',
    discovered_at: '2026-08-12T17:42:00.000Z',
    created_at: '2026-08-12T22:00:00.000Z',
    ...overrides
  };
}

function makeTerminalSqlStore(initialRows = []) {
  const rows = [...initialRows];
  const calls = [];

  function latestSort(a, b) {
    const discoveredDelta = Date.parse(b.discovered_at) - Date.parse(a.discovered_at);
    if (discoveredDelta) return discoveredDelta;

    const createdDelta = Date.parse(b.created_at) - Date.parse(a.created_at);
    if (createdDelta) return createdDelta;

    return String(b.id).localeCompare(String(a.id));
  }

  function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function likePatternRegex(pattern) {
    let source = '';
    const text = String(pattern || '');

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (char === '\\' && index + 1 < text.length) {
        source += escapeRegex(text[index + 1]);
        index += 1;
      } else if (char === '%') {
        source += '.*';
      } else if (char === '_') {
        source += '.';
      } else {
        source += escapeRegex(char);
      }
    }

    return new RegExp(`^${source}$`, 'i');
  }

  function rowMatchesSearch(row, patterns) {
    if (!patterns.length) return true;

    const fields = [
      row.headline,
      row.summary,
      row.alchemist_take,
      row.source_name,
      ...(Array.isArray(row.tags) ? row.tags : [])
    ].map((value) => String(value || ''));

    return patterns.every((pattern) => {
      const regex = likePatternRegex(pattern);
      return fields.some((field) => regex.test(field));
    });
  }

  async function sql(strings, ...values) {
    const query = strings.join(' ').replace(/\s+/g, ' ').trim().toLowerCase();
    calls.push({ query, values });

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
      const isSearchList = query.includes('search_terms(pattern)');
      const category = isSearchList ? values[0] : null;
      const patterns = isSearchList ? JSON.parse(values[2]) : [];
      const limit = isSearchList ? values[4] : values[0];

      return rows
        .filter((row) => !category || row.category === category)
        .filter((row) => rowMatchesSearch(row, patterns))
        .sort(latestSort)
        .slice(0, limit);
    }

    throw new Error(`Unexpected SQL in terminal test: ${query}`);
  }

  return { calls, rows, sql };
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
  assert.deepEqual(validateListQuery({}), { channel: null, limit: 25, sort: 'latest', q: '' });
  assert.deepEqual(validateListQuery({ sort: 'latest' }), { channel: null, limit: 25, sort: 'latest', q: '' });
  assert.deepEqual(validateListQuery({ sort: 'LATEST' }), { channel: null, limit: 25, sort: 'latest', q: '' });
  assert.deepEqual(validateListQuery({ q: '  Twitch\u0000 API \n tools  ' }), {
    channel: null,
    limit: 25,
    sort: 'latest',
    q: 'Twitch API tools'
  });
  assert.deepEqual(validateListQuery({ q: ' \n\t ' }), { channel: null, limit: 25, sort: 'latest', q: '' });
  assert.deepEqual(validateListQuery({ channel: 'RESEARCH', limit: '3', sort: 'latest', q: 'roblox' }), {
    channel: 'RESEARCH',
    limit: 3,
    sort: 'latest',
    q: 'roblox'
  });
  assert.equal(normalizeSearchQuery('x'.repeat(200)).length, 120);
  assert.deepEqual(searchPatterns('100% creator_tools C:\\path'), [
    '%100\\%%',
    '%creator\\_tools%',
    '%C:\\\\path%'
  ]);
  assert.throws(() => validateListQuery({ limit: '0' }), /between 1 and 60/);
  assert.throws(() => validateListQuery({ category: 'RESEARCH' }), /category filter is not supported/);
  assert.throws(() => validateListQuery({ sort: 'highest_signal' }), /sort is not allowed/);
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

test('lists signals by discovered date and optional channel', async () => {
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

  const all = await listSignals({ limit: 2, sort: 'latest' });
  assert.deepEqual(all.map((signal) => signal.externalId), ['new-research', 'industry-signal']);

  const research = await listSignals({ channel: 'RESEARCH', limit: 10, sort: 'latest' });
  assert.equal(research.length, 1);
  assert.equal(research[0].category, 'RESEARCH');
});

test('lists latest signals with deterministic created date and id tie-breakers', async () => {
  const store = makeTerminalSqlStore([
    sampleDbRow({
      id: 'signal-1',
      external_id: 'older-created',
      discovered_at: '2026-08-12T12:00:00.000Z',
      created_at: '2026-08-12T12:01:00.000Z'
    }),
    sampleDbRow({
      id: 'signal-2',
      external_id: 'newest-discovered',
      discovered_at: '2026-08-13T12:00:00.000Z',
      created_at: '2026-08-13T12:00:00.000Z'
    }),
    sampleDbRow({
      id: 'signal-3',
      external_id: 'lower-id-tie',
      discovered_at: '2026-08-12T12:00:00.000Z',
      created_at: '2026-08-12T12:02:00.000Z'
    }),
    sampleDbRow({
      id: 'signal-4',
      external_id: 'higher-id-tie',
      discovered_at: '2026-08-12T12:00:00.000Z',
      created_at: '2026-08-12T12:02:00.000Z'
    })
  ]);
  _setSqlForTests(store.sql);

  const all = await listSignals({ limit: 4, sort: 'latest' });
  assert.deepEqual(all.map((signal) => signal.externalId), [
    'newest-discovered',
    'higher-id-tie',
    'lower-id-tie',
    'older-created'
  ]);
});

test('searches signals across stored text fields and tags', async () => {
  const store = makeTerminalSqlStore([
    sampleDbRow({
      id: 'signal-1',
      external_id: 'headline-match',
      headline: 'Twitch opens a creator API preview',
      summary: 'Platform teams can test richer overlays.',
      category: 'PLATFORMS',
      discovered_at: '2026-08-16T12:00:00.000Z'
    }),
    sampleDbRow({
      id: 'signal-2',
      external_id: 'summary-match',
      headline: 'Guild tooling note',
      summary: 'Roblox NPC workflows are accelerating for builders.',
      category: 'GAME_DEV',
      discovered_at: '2026-08-15T12:00:00.000Z'
    }),
    sampleDbRow({
      id: 'signal-3',
      external_id: 'take-match',
      headline: 'Research memo',
      alchemist_take: 'Map this into a monetization wedge for creators.',
      category: 'MONETIZATION',
      discovered_at: '2026-08-14T12:00:00.000Z'
    }),
    sampleDbRow({
      id: 'signal-4',
      external_id: 'tag-match',
      headline: 'Engine update',
      tags: ['ugc-pipeline', 'avatar-tools'],
      category: 'CREATOR_ECONOMY',
      discovered_at: '2026-08-13T12:00:00.000Z'
    }),
    sampleDbRow({
      id: 'signal-5',
      external_id: 'source-match',
      headline: 'Platform digest',
      source_name: 'Game Developer',
      category: 'INDUSTRY',
      discovered_at: '2026-08-12T12:00:00.000Z'
    })
  ]);
  _setSqlForTests(store.sql);

  assert.deepEqual((await listSignals({ q: 'twitch', limit: 10 })).map((signal) => signal.externalId), ['headline-match']);
  assert.deepEqual((await listSignals({ q: 'ROBLOX', limit: 10 })).map((signal) => signal.externalId), ['summary-match']);
  assert.deepEqual((await listSignals({ q: 'monetization wedge', limit: 10 })).map((signal) => signal.externalId), ['take-match']);
  assert.deepEqual((await listSignals({ q: 'avatar-tools', limit: 10 })).map((signal) => signal.externalId), ['tag-match']);
  assert.deepEqual((await listSignals({ q: 'game developer', limit: 10 })).map((signal) => signal.externalId), ['source-match']);
  assert.deepEqual((await listSignals({ q: 'roblox twitch', limit: 10 })).map((signal) => signal.externalId), []);
});

test('composes terminal search with channel and preserves latest ordering', async () => {
  const store = makeTerminalSqlStore([
    sampleDbRow({
      id: 'signal-1',
      external_id: 'older-platform',
      headline: 'Twitch API change for stream overlays',
      category: 'PLATFORMS',
      discovered_at: '2026-08-12T12:00:00.000Z',
      created_at: '2026-08-12T12:00:00.000Z'
    }),
    sampleDbRow({
      id: 'signal-2',
      external_id: 'newer-platform',
      summary: 'Twitch launches API access for richer creator economy integrations.',
      category: 'PLATFORMS',
      discovered_at: '2026-08-14T12:00:00.000Z',
      created_at: '2026-08-14T12:00:00.000Z'
    }),
    sampleDbRow({
      id: 'signal-3',
      external_id: 'wrong-channel',
      headline: 'Twitch API tutorial for game jams',
      category: 'GAME_DEV',
      discovered_at: '2026-08-15T12:00:00.000Z',
      created_at: '2026-08-15T12:00:00.000Z'
    })
  ]);
  _setSqlForTests(store.sql);

  const platform = await listSignals({
    channel: 'PLATFORMS',
    sort: 'latest',
    q: 'Twitch API',
    limit: 10
  });
  assert.deepEqual(platform.map((signal) => signal.externalId), ['newer-platform', 'older-platform']);

  const all = await listSignals({ sort: 'latest', q: 'Twitch API', limit: 10 });
  assert.deepEqual(all.map((signal) => signal.externalId), ['wrong-channel', 'newer-platform', 'older-platform']);
});

test('terminal search treats blanks and escaped punctuation safely', async () => {
  const store = makeTerminalSqlStore([
    sampleDbRow({
      id: 'signal-1',
      external_id: 'special-characters',
      headline: 'Creator_tools costs hit 100% of the C:\\path budget',
      summary: 'Literal punctuation should remain searchable.',
      discovered_at: '2026-08-14T12:00:00.000Z'
    }),
    sampleDbRow({
      id: 'signal-2',
      external_id: 'normal-result',
      headline: 'Plain signal',
      discovered_at: '2026-08-13T12:00:00.000Z'
    })
  ]);
  _setSqlForTests(store.sql);

  assert.deepEqual((await listSignals({ q: '', limit: 10 })).map((signal) => signal.externalId), [
    'special-characters',
    'normal-result'
  ]);
  assert.deepEqual((await listSignals({ q: '  \n\t ', limit: 10 })).map((signal) => signal.externalId), [
    'special-characters',
    'normal-result'
  ]);
  assert.deepEqual((await listSignals({ q: '100% creator_tools C:\\path', limit: 10 })).map((signal) => signal.externalId), [
    'special-characters'
  ]);
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
    url: '/api/terminal/signals?channel=AI_TOOLS&sort=latest&limit=1'
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

  const unknownSort = await invokeHandler({
    method: 'GET',
    url: '/api/terminal/signals?sort=highest_signal'
  });
  assert.equal(unknownSort.statusCode, 400);
  assert.match(unknownSort.body.error, /sort is not allowed/);
});

test('terminal API applies q search through validated query parameters', async () => {
  const store = makeTerminalSqlStore([
    sampleDbRow({
      id: 'signal-1',
      external_id: 'platform-match',
      headline: 'Twitch API expands platform automation',
      category: 'PLATFORMS',
      discovered_at: '2026-08-14T12:00:00.000Z'
    }),
    sampleDbRow({
      id: 'signal-2',
      external_id: 'industry-match',
      headline: 'Twitch API expands platform automation',
      category: 'INDUSTRY',
      discovered_at: '2026-08-15T12:00:00.000Z'
    }),
    sampleDbRow({
      id: 'signal-3',
      external_id: 'non-match',
      headline: 'Roblox NPC behavior update',
      category: 'PLATFORMS',
      discovered_at: '2026-08-16T12:00:00.000Z'
    })
  ]);
  _setSqlForTests(store.sql);

  const searched = await invokeHandler({
    method: 'GET',
    url: `/api/terminal/signals?channel=PLATFORMS&sort=latest&q=${encodeURIComponent('  twitch   API  ')}`
  });
  assert.equal(searched.statusCode, 200);
  assert.equal(searched.body.success, true);
  assert.equal(searched.body.count, 1);
  assert.deepEqual(searched.body.signals.map((signal) => signal.externalId), ['platform-match']);

  const tooLong = await invokeHandler({
    method: 'GET',
    url: `/api/terminal/signals?q=${encodeURIComponent(`${'x'.repeat(120)} should be clipped`)}`
  });
  assert.equal(tooLong.statusCode, 200);
  assert.equal(tooLong.body.success, true);
  assert.equal(tooLong.body.count, 0);

  const injectionStyle = await invokeHandler({
    method: 'GET',
    url: `/api/terminal/signals?q=${encodeURIComponent("Twitch' OR 1=1 --")}`
  });
  assert.equal(injectionStyle.statusCode, 200);
  assert.equal(injectionStyle.body.success, true);
  assert.equal(injectionStyle.body.count, 0);
  assert.equal(store.calls.at(-1).query.includes("twitch'"), false);
  assert.equal(store.calls.at(-1).query.includes('1=1'), false);
  assert.equal(store.calls.at(-1).values.some((value) => String(value).includes("Twitch'")), true);
  assert.equal(store.calls.at(-1).values.some((value) => String(value).includes('1=1')), true);
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
  assert.equal(TERMINAL_DEFAULT_SORT, 'latest');
  assert.equal(viewModelTerminalDefaultSort, 'latest');
  assert.deepEqual(TERMINAL_SORTS, ['latest']);
  assert.deepEqual(viewModelTerminalSorts, ['latest']);
  assert.deepEqual(TERMINAL_SORT_OPTIONS, [{ value: 'latest', label: 'LATEST' }]);
  assert.deepEqual(viewModelTerminalSortOptions, [{ value: 'latest', label: 'LATEST' }]);
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
  assert.equal(formatOptionalSignalDate(null), '');
  assert.equal(formatOptionalSignalDate('not-a-date'), '');
  assert.equal(formatOptionalSignalDate('2026-13-40'), '');
  assert.equal(formatSignalDate('2026-08-12'), 'Aug 12, 2026');
  assert.equal(formatSignalDate('not-a-date'), 'Unknown date');
  assert.equal(relativeSignalTime(undefined, Date.parse('2026-08-12T17:30:00Z')), 'Recently');
  assert.equal(relativeSignalTime('2026-08-12T16:00:00Z', Date.parse('2026-08-12T17:30:00Z')), '1h ago');
  assert.deepEqual(compactSignalTags(signal, 3), ['ai', 'game-dev', 'automation']);
  assert.equal(strengthSummary(signal, 2), 'Builder, Researcher +2');
});

test('terminal frontend channel helpers normalize selected filters and URLs', () => {
  assert.equal(normalizeTerminalChannel('CREATOR_ECONOMY'), 'CREATOR_ECONOMY');
  assert.equal(normalizeTerminalChannel('AI_TOOL'), '');
  assert.equal(normalizeTerminalSort('latest'), 'latest');
  assert.equal(normalizeTerminalSort('LATEST'), 'latest');
  assert.equal(normalizeTerminalSort('highest_signal'), 'latest');
  assert.equal(normalizeTerminalSearchQuery('  Twitch\u0000   API  '), 'Twitch API');
  assert.equal(normalizeTerminalSearchQuery('x'.repeat(200)).length, 120);
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
  assert.deepEqual(terminalFeedState('?channel=MONETIZATION&sort=latest'), {
    channel: 'MONETIZATION',
    hasDeprecatedCategory: false,
    rawChannel: 'MONETIZATION',
    isUnknownChannel: false,
    sort: 'latest',
    rawSort: 'latest',
    q: '',
    rawQ: '',
    isUnknownSort: false,
    isNoncanonicalSort: false,
    isNoncanonicalQuery: false
  });
  assert.deepEqual(terminalFeedState('?q=twitch'), {
    channel: '',
    hasDeprecatedCategory: false,
    rawChannel: '',
    isUnknownChannel: false,
    sort: 'latest',
    rawSort: '',
    q: 'twitch',
    rawQ: 'twitch',
    isUnknownSort: false,
    isNoncanonicalSort: false,
    isNoncanonicalQuery: false
  });
  assert.deepEqual(terminalFeedState('?channel=AI_TOOL&sort=highest_signal'), {
    channel: '',
    hasDeprecatedCategory: false,
    rawChannel: 'AI_TOOL',
    isUnknownChannel: true,
    sort: 'latest',
    rawSort: 'highest_signal',
    q: '',
    rawQ: '',
    isUnknownSort: true,
    isNoncanonicalSort: true,
    isNoncanonicalQuery: false
  });
  assert.deepEqual(terminalFeedState('?channel=RESEARCH&sort=LATEST&q=%20Twitch%20%20API%20'), {
    channel: 'RESEARCH',
    hasDeprecatedCategory: false,
    rawChannel: 'RESEARCH',
    isUnknownChannel: false,
    sort: 'latest',
    rawSort: 'LATEST',
    q: 'Twitch API',
    rawQ: ' Twitch  API ',
    isUnknownSort: false,
    isNoncanonicalSort: true,
    isNoncanonicalQuery: true
  });
  assert.deepEqual(terminalFeedState('?sort=latest&channel=PLATFORMS&q=twitch'), {
    channel: 'PLATFORMS',
    hasDeprecatedCategory: false,
    rawChannel: 'PLATFORMS',
    isUnknownChannel: false,
    sort: 'latest',
    rawSort: 'latest',
    q: 'twitch',
    rawQ: 'twitch',
    isUnknownSort: false,
    isNoncanonicalSort: false,
    isNoncanonicalQuery: false
  });

  const terminalUrl = terminalUrlWithState(
    'https://www.gamingalchemists.com/terminal?category=AI_TOOL&view=compact',
    { channel: 'CREATOR_ECONOMY', sort: 'latest', q: 'Twitch API' }
  );
  assert.equal(terminalUrl.pathname, '/terminal');
  assert.equal(terminalUrl.searchParams.get('channel'), 'CREATOR_ECONOMY');
  assert.equal(terminalUrl.searchParams.get('sort'), 'latest');
  assert.equal(terminalUrl.searchParams.get('q'), 'Twitch API');
  assert.equal(terminalUrl.searchParams.get('category'), null);
  assert.equal(terminalUrl.searchParams.get('view'), 'compact');

  const allUrl = terminalUrlWithChannel('https://www.gamingalchemists.com/terminal?channel=MONETIZATION&q=creator', '');
  assert.equal(allUrl.searchParams.get('channel'), null);
  assert.equal(allUrl.searchParams.get('sort'), 'latest');
  assert.equal(allUrl.searchParams.get('q'), 'creator');

  const sortUrl = terminalUrlWithSort(
    'https://www.gamingalchemists.com/terminal?channel=MONETIZATION&q=twitch&view=compact',
    'latest'
  );
  assert.equal(sortUrl.searchParams.get('channel'), 'MONETIZATION');
  assert.equal(sortUrl.searchParams.get('sort'), 'latest');
  assert.equal(sortUrl.searchParams.get('q'), 'twitch');
  assert.equal(sortUrl.searchParams.get('view'), 'compact');

  const searchUrl = terminalUrlWithSearch(
    'https://www.gamingalchemists.com/terminal?channel=PLATFORMS&sort=latest&q=twitch',
    ''
  );
  assert.equal(searchUrl.searchParams.get('channel'), 'PLATFORMS');
  assert.equal(searchUrl.searchParams.get('sort'), 'latest');
  assert.equal(searchUrl.searchParams.get('q'), null);

  const canonicalUrl = terminalUrlWithState(
    'https://www.gamingalchemists.com/terminal?category=AI_TOOL&channel=AI_TOOL&sort=highest_signal&q=%00',
    {}
  );
  assert.equal(canonicalUrl.searchParams.get('category'), null);
  assert.equal(canonicalUrl.searchParams.get('channel'), null);
  assert.equal(canonicalUrl.searchParams.get('sort'), 'latest');
  assert.equal(canonicalUrl.searchParams.get('q'), null);

  const apiUrl = terminalSignalsUrl('https://www.gamingalchemists.com', {
    channel: 'MONETIZATION',
    sort: 'latest',
    q: '  Twitch   API  ',
    limit: 50
  });
  assert.equal(apiUrl.toString(), 'https://www.gamingalchemists.com/api/terminal/signals?limit=50&sort=latest&channel=MONETIZATION&q=Twitch+API');

  const unknownApiUrl = terminalSignalsUrl('https://www.gamingalchemists.com', {
    channel: 'AI_TOOL',
    sort: 'highest_signal',
    q: ' \n ',
    limit: 50
  });
  assert.equal(unknownApiUrl.toString(), 'https://www.gamingalchemists.com/api/terminal/signals?limit=50&sort=latest');
});

test('terminal page exposes search controls and no-results hooks', () => {
  const html = fs.readFileSync(`${__dirname}/../terminal.html`, 'utf8');

  assert.match(html, /<form class="terminal-search"[^>]+role="search"/);
  assert.match(html, /<label class="terminal-search__label mono" for="terminal-search">Search<\/label>/);
  assert.match(html, /id="terminal-search"[\s\S]+type="search"[\s\S]+maxlength="120"/);
  assert.match(html, /id="terminal-search-clear"[\s\S]+aria-label="Clear search"/);
  assert.match(html, /id="terminal-search-summary"/);
  assert.match(html, /id="terminal-empty-title"/);
  assert.match(html, /id="terminal-empty-copy"/);
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

  assert.deepEqual(signalProvenanceParts(null), []);

  assert.equal(missingOriginal.join(' ').includes('Verified'), false);
});
