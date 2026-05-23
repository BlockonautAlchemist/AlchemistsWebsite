const assert = require('node:assert/strict');
const test = require('node:test');

const { alchemistStreamers } = require('../src/data/streamers');
const {
  normalizeStreamers,
  sortStreamers,
  templateThumbnail,
  resolveTwitchThumbnail,
  buildEmbedUrl,
  fetchLatestVideo,
  indexByLogin,
  indexByUserId,
  getStreamersData,
  EMBED_DOMAIN_PLACEHOLDER,
  _resetCachesForTests
} = require('../server/streamers/twitch');

const originalFetch = global.fetch;
const originalClientId = process.env.TWITCH_CLIENT_ID;
const originalClientSecret = process.env.TWITCH_CLIENT_SECRET;
let baselineFromRegistry;
let buildTwitchEmbedUrl;
let compactStreamerTags;
let formatViewers;
let monogram;
let resolveEmbedUrl;
let selectActiveStreamer;
let streamCategoryLabel;
let streamStatusLabel;
let viewerCountLabel;

test.before(async () => {
  ({
    baselineFromRegistry,
    buildTwitchEmbedUrl,
    compactStreamerTags,
    formatViewers,
    monogram,
    resolveEmbedUrl,
    selectActiveStreamer,
    streamCategoryLabel,
    streamStatusLabel,
    viewerCountLabel
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

// A fetch stub that routes by URL: token -> streams -> users -> videos.
// Get Videos is queried one user_id at a time, so filter the catalog by the
// user_id in the request (mirroring the real Helix behaviour).
function mockTwitchFetch({ streams = [], users = [], videos = [] } = {}) {
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
    if (target.includes('helix/videos')) {
      const userId = new URL(target).searchParams.get('user_id');
      return jsonResponse({ data: videos.filter((video) => String(video.user_id) === userId) });
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

test('templateThumbnail also handles the Get Videos %{width} format', () => {
  assert.equal(
    templateThumbnail('https://cdn/vod-%{width}x%{height}.jpg'),
    'https://cdn/vod-440x248.jpg'
  );
  // Empty string (a freshly-created VOD still processing) is treated as missing.
  assert.equal(templateThumbnail(''), null);
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

  // Alpha has no Get Users entry here: bio/displayName fall back to the registry.
  assert.equal(alpha.bio, 'a');
  assert.equal(alpha.twitchDescription, null);
  assert.equal(alpha.localBio, 'a');
  assert.equal(alpha.displayName, 'Alpha');

  // Beta is offline: stream-specific fields are null but it still appears,
  // and its avatar comes from Get Users (case-insensitive login match).
  assert.equal(beta.isLive, false);
  assert.equal(beta.streamTitle, null);
  assert.equal(beta.viewerCount, null);
  assert.equal(beta.thumbnailUrl, null);
  assert.equal(beta.avatarUrl, 'https://img/beta.png');
});

test('normalizeStreamers prefers Twitch description and display_name, with local fallback', () => {
  const users = indexByLogin(
    [
      // Alpha: real Twitch about text + canonical display name.
      { login: 'alpha', description: 'Twitch about for alpha', display_name: 'AlphaTV' },
      // Beta: empty description and no display_name -> both fall back to registry.
      { login: 'beta', description: '', profile_image_url: 'https://img/beta.png' }
    ],
    'login'
  );

  const [alpha, beta] = normalizeStreamers(REGISTRY, new Map(), users);

  // Twitch description wins for the card bio; localBio always preserves the registry text.
  assert.equal(alpha.bio, 'Twitch about for alpha');
  assert.equal(alpha.twitchDescription, 'Twitch about for alpha');
  assert.equal(alpha.localBio, 'a');
  assert.equal(alpha.displayName, 'AlphaTV');

  // Empty Twitch description is treated as missing: fall back to the local bio/name.
  assert.equal(beta.bio, 'b');
  assert.equal(beta.twitchDescription, null);
  assert.equal(beta.localBio, 'b');
  assert.equal(beta.displayName, 'Beta');
});

test('normalizeStreamers attaches the latest video via user id, null when absent', () => {
  const users = indexByLogin(
    [
      { login: 'alpha', id: '111', profile_image_url: 'https://img/alpha.png' },
      { login: 'beta', id: '222', profile_image_url: 'https://img/beta.png' }
    ],
    'login'
  );
  // Only alpha (user id 111) has a recent video; beta should stay null.
  const videos = indexByUserId([
    {
      user_id: '111',
      title: 'Boss Fighters Finals',
      url: 'https://www.twitch.tv/videos/987654321',
      thumbnail_url: 'https://cdn/vod-%{width}x%{height}.jpg',
      created_at: '2026-05-20T18:00:00Z'
    }
  ]);

  const [alpha, beta] = normalizeStreamers(REGISTRY, new Map(), users, videos);

  assert.equal(alpha.latestVideoTitle, 'Boss Fighters Finals');
  assert.equal(alpha.latestVideoUrl, 'https://www.twitch.tv/videos/987654321');
  assert.equal(alpha.latestVideoThumbnailUrl, 'https://cdn/vod-440x248.jpg');
  assert.equal(alpha.latestVideoCreatedAt, '2026-05-20T18:00:00Z');

  assert.equal(beta.latestVideoTitle, null);
  assert.equal(beta.latestVideoUrl, null);
  assert.equal(beta.latestVideoThumbnailUrl, null);
  assert.equal(beta.latestVideoCreatedAt, null);
});

test('normalizeStreamers resolves live media: type, cache-busted preview, channel embed', () => {
  const streams = indexByLogin(
    [{ user_login: 'alpha', type: 'live', title: 'Live', thumbnail_url: 'https://cdn/a-{width}x{height}.jpg' }],
    'user_login'
  );
  const users = indexByLogin([{ login: 'alpha', id: '1', offline_image_url: 'https://img/a-offline.png' }], 'login');

  const [alpha] = normalizeStreamers(REGISTRY, streams, users);

  assert.equal(alpha.mediaType, 'live');
  assert.equal(alpha.liveThumbnailUrl, 'https://cdn/a-440x248.jpg');
  // Live preview = resolved thumbnail + a cache-busting query param (refreshes each poll).
  assert.match(alpha.mediaPreviewUrl, /^https:\/\/cdn\/a-440x248\.jpg\?t=\d+$/);
  assert.equal(
    alpha.embedUrl,
    `https://player.twitch.tv/?channel=alpha&parent=${EMBED_DOMAIN_PLACEHOLDER}&muted=true&autoplay=true`
  );
  assert.equal(alpha.offlineImageUrl, 'https://img/a-offline.png');
});

test('normalizeStreamers resolves vod media from the latest video', () => {
  const users = indexByLogin([{ login: 'alpha', id: '1', profile_image_url: 'https://img/a.png' }], 'login');
  const videos = indexByUserId([
    {
      user_id: '1',
      id: '987654321',
      alchemistType: 'highlight',
      title: 'Best moments',
      url: 'https://www.twitch.tv/videos/987654321',
      thumbnail_url: 'https://cdn/v-%{width}x%{height}.jpg',
      created_at: '2026-05-20T18:00:00Z'
    }
  ]);

  const [alpha] = normalizeStreamers(REGISTRY, new Map(), users, videos);

  assert.equal(alpha.mediaType, 'vod');
  assert.equal(alpha.latestVideoId, '987654321');
  assert.equal(alpha.latestVideoType, 'highlight');
  assert.equal(alpha.mediaPreviewUrl, 'https://cdn/v-440x248.jpg');
  assert.equal(
    alpha.embedUrl,
    `https://player.twitch.tv/?video=987654321&parent=${EMBED_DOMAIN_PLACEHOLDER}&muted=true&autoplay=true`
  );
});

test('normalizeStreamers falls back to offline/profile image when no live or video', () => {
  const users = indexByLogin(
    [
      { login: 'alpha', id: '1', offline_image_url: 'https://img/a-offline.png', profile_image_url: 'https://img/a.png' },
      { login: 'beta', id: '2', profile_image_url: 'https://img/b.png' }
    ],
    'login'
  );

  const [alpha, beta] = normalizeStreamers(REGISTRY, new Map(), users);

  assert.equal(alpha.mediaType, 'fallback');
  assert.equal(alpha.embedUrl, null);
  // offline_image_url wins over the profile image for the fallback preview.
  assert.equal(alpha.mediaPreviewUrl, 'https://img/a-offline.png');
  // Beta has no offline image: fall back to the profile image.
  assert.equal(beta.mediaPreviewUrl, 'https://img/b.png');
});

test('resolveTwitchThumbnail aliases the shared thumbnail templating helper', () => {
  assert.equal(resolveTwitchThumbnail, templateThumbnail);
  assert.equal(resolveTwitchThumbnail('https://cdn/x-%{width}x%{height}.jpg'), 'https://cdn/x-440x248.jpg');
});

test('buildEmbedUrl builds channel/video player URLs with a domain placeholder', () => {
  assert.equal(
    buildEmbedUrl({ channel: 'Alpha' }),
    `https://player.twitch.tv/?channel=alpha&parent=${EMBED_DOMAIN_PLACEHOLDER}&muted=true&autoplay=true`
  );
  assert.equal(
    buildEmbedUrl({ video: '555' }),
    `https://player.twitch.tv/?video=555&parent=${EMBED_DOMAIN_PLACEHOLDER}&muted=true&autoplay=true`
  );
  assert.equal(buildEmbedUrl({}), null);
});

test('fetchLatestVideo tries archive then highlight then upload, returning the first hit', async () => {
  const auth = { clientId: 'cid', token: 't' };

  const calls = [];
  global.fetch = (url) => {
    const type = new URL(String(url)).searchParams.get('type');
    calls.push(type);
    const data = type === 'upload' ? [{ id: '9', user_id: '1', title: 'Upload' }] : [];
    return jsonResponse({ data });
  };
  const video = await fetchLatestVideo('1', auth);
  assert.deepEqual(calls, ['archive', 'highlight', 'upload']);
  assert.equal(video.id, '9');
  assert.equal(video.alchemistType, 'upload');

  // No videos of any type -> null after trying all three.
  const empties = [];
  global.fetch = (url) => {
    empties.push(new URL(String(url)).searchParams.get('type'));
    return jsonResponse({ data: [] });
  };
  assert.equal(await fetchLatestVideo('1', auth), null);
  assert.deepEqual(empties, ['archive', 'highlight', 'upload']);
});

test('getStreamersData isolates a per-streamer video failure', async () => {
  _resetCachesForTests();
  process.env.TWITCH_CLIENT_ID = 'cid';
  process.env.TWITCH_CLIENT_SECRET = 'secret';
  global.fetch = (url) => {
    const target = String(url);
    if (target.includes('oauth2/token')) return jsonResponse({ access_token: 't', expires_in: 3600 });
    if (target.includes('helix/streams')) return jsonResponse({ data: [] });
    if (target.includes('helix/users')) {
      return jsonResponse({
        data: [
          { login: 'scifihighvr', id: '101', profile_image_url: 'https://img/s.png' },
          { login: 'microkong', id: '102', profile_image_url: 'https://img/m.png' }
        ]
      });
    }
    if (target.includes('helix/videos')) {
      const params = new URL(target).searchParams;
      if (params.get('user_id') === '101') return jsonResponse({}, { ok: false, status: 500 });
      const data = params.get('type') === 'archive'
        ? [{ user_id: '102', id: '77', title: 'MK VOD', url: 'https://www.twitch.tv/videos/77', thumbnail_url: 'https://cdn/m-%{width}x%{height}.jpg', created_at: '2026-05-19T00:00:00Z' }]
        : [];
      return jsonResponse({ data });
    }
    throw new Error(`Unexpected fetch to ${target}`);
  };

  const data = await getStreamersData();
  assert.equal(data.degraded, false);
  const scifi = data.streamers.find((s) => s.twitchUsername === 'scifihighvr');
  const mk = data.streamers.find((s) => s.twitchUsername === 'microkong');
  // The failing creator degrades to a branded fallback; the healthy one still gets its VOD.
  assert.equal(scifi.mediaType, 'fallback');
  assert.equal(scifi.latestVideoUrl, null);
  assert.equal(mk.mediaType, 'vod');
  assert.equal(mk.latestVideoId, '77');
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

test('getStreamersData attaches the latest recent video per streamer', async () => {
  _resetCachesForTests();
  process.env.TWITCH_CLIENT_ID = 'cid';
  process.env.TWITCH_CLIENT_SECRET = 'secret';
  global.fetch = mockTwitchFetch({
    users: [
      { login: 'scifihighvr', id: '101', profile_image_url: 'https://img/scifi.png' },
      { login: 'microkong', id: '102', profile_image_url: 'https://img/mk.png' }
    ],
    videos: [
      {
        user_id: '102',
        title: 'Partner Game Night',
        url: 'https://www.twitch.tv/videos/555',
        thumbnail_url: 'https://cdn/mk-%{width}x%{height}.jpg',
        created_at: '2026-05-19T20:00:00Z'
      }
    ]
  });

  const data = await getStreamersData();
  assert.equal(data.degraded, false);

  const microkong = data.streamers.find((s) => s.twitchUsername === 'microkong');
  assert.equal(microkong.latestVideoTitle, 'Partner Game Night');
  assert.equal(microkong.latestVideoUrl, 'https://www.twitch.tv/videos/555');
  assert.equal(microkong.latestVideoThumbnailUrl, 'https://cdn/mk-440x248.jpg');

  // A streamer with no video keeps null fields.
  const scifi = data.streamers.find((s) => s.twitchUsername === 'scifihighvr');
  assert.equal(scifi.latestVideoUrl, null);
});

test('getStreamersData keeps live status when the video fetch fails', async () => {
  _resetCachesForTests();
  process.env.TWITCH_CLIENT_ID = 'cid';
  process.env.TWITCH_CLIENT_SECRET = 'secret';
  global.fetch = (url) => {
    const target = String(url);
    if (target.includes('oauth2/token')) return jsonResponse({ access_token: 't', expires_in: 3600 });
    if (target.includes('helix/streams')) {
      return jsonResponse({ data: [{ user_login: 'scifihighvr', type: 'live', title: 'Live', viewer_count: 5 }] });
    }
    if (target.includes('helix/users')) {
      return jsonResponse({ data: [{ login: 'scifihighvr', id: '101' }] });
    }
    if (target.includes('helix/videos')) return jsonResponse({}, { ok: false, status: 500 });
    throw new Error(`Unexpected fetch to ${target}`);
  };

  const data = await getStreamersData();
  // Video failure must not degrade the page or live status.
  assert.equal(data.degraded, false);
  assert.equal(data.reason, null);
  const scifi = data.streamers.find((s) => s.twitchUsername === 'scifihighvr');
  assert.equal(scifi.isLive, true);
  assert.equal(scifi.latestVideoUrl, null);
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

test('client active streamer selection is live-first, then featured, then registry order', () => {
  const list = [
    { twitchUsername: 'plain', isLive: false, featured: false },
    { twitchUsername: 'featured', isLive: false, featured: true },
    { twitchUsername: 'live', isLive: true, featured: false }
  ];

  assert.equal(selectActiveStreamer(list).twitchUsername, 'live');
  assert.equal(selectActiveStreamer(list, 'FEATURED').twitchUsername, 'featured');
  assert.equal(selectActiveStreamer(list.slice(0, 2)).twitchUsername, 'featured');
  assert.equal(selectActiveStreamer([{ twitchUsername: 'plain', isLive: false, featured: false }]).twitchUsername, 'plain');
  assert.equal(selectActiveStreamer([]), null);
});

test('client viewer and status helpers produce compact labels', () => {
  assert.equal(viewerCountLabel({ viewerCount: 4321 }), '4.3K watching');
  assert.equal(viewerCountLabel({ viewerCount: null }), null);
  assert.equal(streamStatusLabel({ isLive: true }), 'Live now');
  assert.equal(streamStatusLabel({ isLive: false }), 'Offline');
});

test('client compact streamer helpers prefer current category and dedupe tags', () => {
  const streamer = {
    gameName: 'Boss Fighters',
    preferredGames: ['boss fighters', 'VR Games', 'Alchemist Events', 'Community Events']
  };

  assert.deepEqual(compactStreamerTags(streamer), ['Boss Fighters', 'VR Games', 'Alchemist Events']);
  assert.deepEqual(compactStreamerTags({ preferredGames: ['One', 'Two'] }, 1), ['One']);
  assert.deepEqual(compactStreamerTags({ preferredGames: 'not-array' }), []);
  assert.equal(streamCategoryLabel(streamer), 'Boss Fighters');
  assert.equal(streamCategoryLabel({ preferredGames: ['Partner Games'] }), 'Partner Games');
  assert.equal(streamCategoryLabel({ preferredGames: [] }), 'Alchemist Stream');
});

test('client buildTwitchEmbedUrl creates the official iframe URL', () => {
  const url = buildTwitchEmbedUrl({
    channel: 'SciFiHighVR',
    parent: 'example.com',
    autoplay: true,
    muted: true
  });

  assert.equal(url, 'https://player.twitch.tv/?channel=scifihighvr&parent=example.com&muted=true&autoplay=true');
  assert.equal(buildTwitchEmbedUrl({ channel: 'scifihighvr', parent: '' }), null);
  assert.equal(buildTwitchEmbedUrl({ channel: '', parent: 'example.com' }), null);
});

test('client buildTwitchEmbedUrl plays a VOD when given a video id', () => {
  assert.equal(
    buildTwitchEmbedUrl({ video: '987654321', parent: 'example.com' }),
    'https://player.twitch.tv/?video=987654321&parent=example.com&muted=true&autoplay=true'
  );
  // A leading "v" prefix is stripped; missing parent still returns null.
  assert.equal(
    buildTwitchEmbedUrl({ video: 'v555', parent: 'example.com', autoplay: false, muted: false }),
    'https://player.twitch.tv/?video=555&parent=example.com&muted=false&autoplay=false'
  );
  assert.equal(buildTwitchEmbedUrl({ video: '555', parent: '' }), null);
});

test('client resolveEmbedUrl swaps the domain placeholder for the current host', () => {
  const url = `https://player.twitch.tv/?channel=alpha&parent=${EMBED_DOMAIN_PLACEHOLDER}&muted=true&autoplay=true`;
  assert.equal(
    resolveEmbedUrl(url, 'localhost'),
    'https://player.twitch.tv/?channel=alpha&parent=localhost&muted=true&autoplay=true'
  );
  assert.equal(resolveEmbedUrl(url, ''), null);
  assert.equal(resolveEmbedUrl(null, 'localhost'), null);
});

test('client monogram derives initials', () => {
  assert.equal(monogram('SciFiHighVR'), 'SC');
  assert.equal(monogram('Merlin The Alchemist'), 'MT');
  assert.equal(monogram(''), '?');
});
