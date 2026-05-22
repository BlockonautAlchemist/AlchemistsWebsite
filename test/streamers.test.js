const assert = require('node:assert/strict');
const test = require('node:test');

const { alchemistStreamers } = require('../src/data/streamers');
const {
  normalizeStreamers,
  sortStreamers,
  templateThumbnail,
  indexByLogin,
  getStreamersData,
  _resetCachesForTests
} = require('../server/streamers/twitch');

const originalFetch = global.fetch;
const originalClientId = process.env.TWITCH_CLIENT_ID;
const originalClientSecret = process.env.TWITCH_CLIENT_SECRET;
let baselineFromRegistry;
let formatViewers;
let monogram;

test.before(async () => {
  ({
    baselineFromRegistry,
    formatViewers,
    monogram
  } = await import('../src/streamers/viewModel.mjs'));
});

function restoreEnv(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

test.after(() => {
  global.fetch = originalFetch;
  restoreEnv('TWITCH_CLIENT_ID', originalClientId);
  restoreEnv('TWITCH_CLIENT_SECRET', originalClientSecret);
});

function jsonResponse(payload, { ok = true, status = 200 } = {}) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(payload) });
}

// A fetch stub that routes by URL: token -> streams -> users.
function mockTwitchFetch({ streams = [], users = [] } = {}) {
  return (url) => {
    const target = String(url);
    if (target.includes('id.twitch.tv/oauth2/token')) {
      return jsonResponse({ access_token: 'test-token', expires_in: 3600 });
    }
    if (target.includes('helix/streams')) {
      return jsonResponse({ data: streams });
    }
    if (target.includes('helix/users')) {
      return jsonResponse({ data: users });
    }
    throw new Error(`Unexpected fetch to ${target}`);
  };
}

const REGISTRY = [
  { displayName: 'Alpha', twitchUsername: 'alpha', twitchUrl: 'https://twitch.tv/alpha', discordName: 'Alpha', bio: 'a', preferredGames: ['G1'], featured: true },
  { displayName: 'Beta', twitchUsername: 'Beta', twitchUrl: 'https://twitch.tv/beta', discordName: 'Beta', bio: 'b', preferredGames: ['G2'], featured: false }
];

test('templateThumbnail substitutes width/height placeholders', () => {
  assert.equal(
    templateThumbnail('https://cdn/preview-{width}x{height}.jpg'),
    'https://cdn/preview-440x248.jpg'
  );
  assert.equal(templateThumbnail(null), null);
});

test('normalizeStreamers maps live and offline streamers correctly', () => {
  const streams = indexByLogin(
    [{ user_login: 'alpha', type: 'live', title: 'Live Title', game_name: 'Boss Fighters', viewer_count: 42, thumbnail_url: 'https://cdn/a-{width}x{height}.jpg', started_at: '2026-05-21T10:00:00Z' }],
    'user_login'
  );
  const users = indexByLogin(
    [{ login: 'beta', profile_image_url: 'https://img/beta.png' }],
    'login'
  );

  const result = normalizeStreamers(REGISTRY, streams, users);
  const [alpha, beta] = result;

  assert.equal(alpha.isLive, true);
  assert.equal(alpha.streamTitle, 'Live Title');
  assert.equal(alpha.gameName, 'Boss Fighters');
  assert.equal(alpha.viewerCount, 42);
  assert.equal(alpha.thumbnailUrl, 'https://cdn/a-440x248.jpg');
  assert.equal(alpha.startedAt, '2026-05-21T10:00:00Z');

  // Beta is offline: stream-specific fields are null but it still appears,
  // and its avatar comes from Get Users (case-insensitive login match).
  assert.equal(beta.isLive, false);
  assert.equal(beta.streamTitle, null);
  assert.equal(beta.viewerCount, null);
  assert.equal(beta.thumbnailUrl, null);
  assert.equal(beta.avatarUrl, 'https://img/beta.png');
});

test('sortStreamers orders live > featured > registry order', () => {
  const list = [
    { twitchUsername: 'a', isLive: false, featured: false },
    { twitchUsername: 'b', isLive: false, featured: true },
    { twitchUsername: 'c', isLive: true, featured: false },
    { twitchUsername: 'd', isLive: false, featured: true }
  ];
  const order = sortStreamers(list).map((s) => s.twitchUsername);
  // live first (c), then featured in original order (b, d), then the rest (a)
  assert.deepEqual(order, ['c', 'b', 'd', 'a']);
});

test('getStreamersData degrades gracefully when credentials are missing', async () => {
  _resetCachesForTests();
  delete process.env.TWITCH_CLIENT_ID;
  delete process.env.TWITCH_CLIENT_SECRET;
  global.fetch = () => {
    throw new Error('fetch should not be called without credentials');
  };

  const data = await getStreamersData();
  assert.equal(data.ok, true);
  assert.equal(data.degraded, true);
  assert.equal(data.reason, 'missing-twitch-credentials');
  assert.equal(data.streamers.length, alchemistStreamers.length);
  assert.ok(data.streamers.every((s) => s.isLive === false));
});

test('getStreamersData returns normalized live data with credentials', async () => {
  _resetCachesForTests();
  process.env.TWITCH_CLIENT_ID = 'cid';
  process.env.TWITCH_CLIENT_SECRET = 'secret';
  global.fetch = mockTwitchFetch({
    streams: [
      { user_login: 'scifihighvr', type: 'live', title: 'VR Horror Night', game_name: 'Boss Fighters', viewer_count: 1234, thumbnail_url: 'https://cdn/scifi-{width}x{height}.jpg', started_at: '2026-05-21T12:00:00Z' }
    ],
    users: [
      { login: 'scifihighvr', profile_image_url: 'https://img/scifi.png' },
      { login: 'microkong', profile_image_url: 'https://img/mk.png' }
    ]
  });

  const data = await getStreamersData();
  assert.equal(data.degraded, false);
  assert.equal(data.reason, null);
  assert.equal(data.streamers.length, alchemistStreamers.length);

  // Live streamer is sorted to the front and fully populated.
  const top = data.streamers[0];
  assert.equal(top.twitchUsername, 'scifihighvr');
  assert.equal(top.isLive, true);
  assert.equal(top.viewerCount, 1234);
  assert.equal(top.thumbnailUrl, 'https://cdn/scifi-440x248.jpg');

  const microkong = data.streamers.find((s) => s.twitchUsername === 'microkong');
  assert.equal(microkong.isLive, false);
  assert.equal(microkong.avatarUrl, 'https://img/mk.png');
});

test('getStreamersData degrades when Twitch fetch fails', async () => {
  _resetCachesForTests();
  process.env.TWITCH_CLIENT_ID = 'cid';
  process.env.TWITCH_CLIENT_SECRET = 'secret';
  global.fetch = (url) => {
    if (String(url).includes('oauth2/token')) {
      return jsonResponse({ access_token: 't', expires_in: 3600 });
    }
    return jsonResponse({}, { ok: false, status: 500 });
  };

  const data = await getStreamersData();
  assert.equal(data.degraded, true);
  assert.equal(data.reason, 'twitch-unavailable');
  assert.equal(data.streamers.length, alchemistStreamers.length);
});

test('client baselineFromRegistry produces offline cards from the registry', () => {
  const baseline = baselineFromRegistry(alchemistStreamers);
  assert.equal(baseline.length, alchemistStreamers.length);
  assert.ok(baseline.every((s) => s.isLive === false));
  assert.equal(baseline[0].displayName, alchemistStreamers[0].displayName);
});

test('client formatViewers formats counts compactly', () => {
  assert.equal(formatViewers(0), '0');
  assert.equal(formatViewers(999), '999');
  assert.equal(formatViewers(1200), '1.2K');
  assert.equal(formatViewers(15400), '15.4K');
  assert.equal(formatViewers(null), null);
});

test('client monogram derives initials', () => {
  assert.equal(monogram('SciFiHighVR'), 'SC');
  assert.equal(monogram('Merlin The Alchemist'), 'MT');
  assert.equal(monogram(''), '?');
});
