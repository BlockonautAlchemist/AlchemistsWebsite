// Twitch integration for the Alchemist Streamers Hub.
//
// SECURITY: everything here runs server-side only. TWITCH_CLIENT_ID and
// TWITCH_CLIENT_SECRET (and the access tokens derived from them) are treated like
// passwords and are NEVER sent to the browser. The browser only ever sees the
// normalized output of getStreamersData() via /api/streamers.
//
// Auth: OAuth Client Credentials flow -> app access token -> Helix "Get Streams"
// (live status) + "Get Users" (profile images). Docs:
//   https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/
//   https://dev.twitch.tv/docs/api/reference (Get Streams / Get Users)

const { alchemistStreamers } = require('../../src/data/streamers');

const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const HELIX_STREAMS_URL = 'https://api.twitch.tv/helix/streams';
const HELIX_USERS_URL = 'https://api.twitch.tv/helix/users';
const HELIX_VIDEOS_URL = 'https://api.twitch.tv/helix/videos';

const DEFAULT_TTL_MS = 90 * 1000; // 60-180s window; absorbs page-load bursts.
const THUMB_WIDTH = 440;
const THUMB_HEIGHT = 248;
// "Get Videos" type used for offline "latest content". archive = the streamer's
// most recent past broadcast (VOD), which exists for far more channels than
// curated highlights. Switch to 'highlight' here if you prefer hand-picked clips.
const VIDEO_TYPE = 'archive';

// --- In-memory caches --------------------------------------------------------
// NOTE: these live on a single warm serverless instance. On Vercel Fluid Compute
// instances are reused, so this meaningfully reduces Twitch calls, but it is not
// shared across instances or cold starts. The /api/streamers route also sets
// CDN Cache-Control headers as a second, shared layer.
// TODO(v2): move to a durable cache (Vercel Runtime Cache API / KV / Edge Config)
//   for cross-instance consistency once traffic justifies it.
let tokenCache = { token: null, expiresAt: 0 };
let dataCache = { data: null, expiresAt: 0 };

function getTwitchCredentials() {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

async function getAppAccessToken({ clientId, clientSecret, forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && tokenCache.token && tokenCache.expiresAt > now) {
    return tokenCache.token;
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials'
  });

  const res = await fetch(TWITCH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!res.ok) {
    throw new Error(`Twitch token request failed (${res.status}).`);
  }

  const json = await res.json();
  if (!json || !json.access_token) {
    throw new Error('Twitch token response missing access_token.');
  }

  // Refresh slightly early (60s skew) to avoid using a token that expires mid-call.
  const expiresInMs = Math.max(0, (Number(json.expires_in) || 0) - 60) * 1000;
  tokenCache = { token: json.access_token, expiresAt: now + expiresInMs };
  return tokenCache.token;
}

function buildLoginQuery(param, logins) {
  const search = new URLSearchParams();
  for (const login of logins) search.append(param, login);
  return search.toString();
}

class TwitchHttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'TwitchHttpError';
    this.status = status;
  }
}

async function fetchHelix(url, { clientId, token }) {
  const res = await fetch(url, {
    headers: {
      'Client-Id': clientId,
      Authorization: `Bearer ${token}`
    }
  });

  if (!res.ok) {
    throw new TwitchHttpError(res.status, `Twitch Helix request failed (${res.status}).`);
  }

  const json = await res.json();
  return Array.isArray(json.data) ? json.data : [];
}

function fetchHelixStreams(logins, auth) {
  if (!logins.length) return Promise.resolve([]);
  // Twitch caps at 100 user_login values per request; v1 has 4, so a single call is fine.
  return fetchHelix(`${HELIX_STREAMS_URL}?${buildLoginQuery('user_login', logins)}`, auth);
}

function fetchHelixUsers(logins, auth) {
  if (!logins.length) return Promise.resolve([]);
  return fetchHelix(`${HELIX_USERS_URL}?${buildLoginQuery('login', logins)}`, auth);
}

// "Get Videos" accepts only ONE user_id per request (unlike Get Streams/Users,
// which batch by login). So we fan out one request per user-id and keep the most
// recent result. Returns a flat array of video objects (0 or 1 per user).
async function fetchHelixVideos(userIds, auth, { type = VIDEO_TYPE } = {}) {
  if (!Array.isArray(userIds) || !userIds.length) return [];
  const results = await Promise.all(
    userIds.map((userId) => {
      const search = new URLSearchParams({ user_id: String(userId), type, first: '1' });
      return fetchHelix(`${HELIX_VIDEOS_URL}?${search.toString()}`, auth);
    })
  );
  return results.flat();
}

function indexByLogin(items, key) {
  const map = new Map();
  for (const item of items) {
    const login = item && item[key];
    if (typeof login === 'string') map.set(login.toLowerCase(), item);
  }
  return map;
}

// Index videos by Twitch user_id, keeping the first (most recent) per user.
// user_id can be a string or number in the API, so normalize to a string key.
function indexByUserId(videos) {
  const map = new Map();
  for (const video of videos) {
    const userId = video && video.user_id;
    if (userId == null) continue;
    const key = String(userId);
    if (!map.has(key)) map.set(key, video);
  }
  return map;
}

// Get Streams thumbnails use "{width}x{height}" placeholders; Get Videos uses
// "%{width}x%{height}". Handle both, and treat empty strings (a freshly-created
// VOD whose thumbnail is still processing) as "no thumbnail".
function templateThumbnail(url, width = THUMB_WIDTH, height = THUMB_HEIGHT) {
  if (!url) return null;
  return url.replace(/%?\{width\}/g, String(width)).replace(/%?\{height\}/g, String(height));
}

// Pure: merges the registry with Twitch Helix results into the frontend shape.
// videosByUserId maps a Twitch user_id -> a single recent video object (from
// Get Videos). It is optional so existing 3-arg callers keep working.
function normalizeStreamers(registry, streamsByLogin, usersByLogin, videosByUserId) {
  const streams = streamsByLogin instanceof Map ? streamsByLogin : new Map();
  const users = usersByLogin instanceof Map ? usersByLogin : new Map();
  const videos = videosByUserId instanceof Map ? videosByUserId : new Map();

  return registry.map((streamer) => {
    const login = String(streamer.twitchUsername || '').toLowerCase();
    const stream = streams.get(login);
    const user = users.get(login);
    const isLive = Boolean(stream) && stream.type === 'live';
    // Twitch "about" text. Can be an empty string for creators who never set one,
    // so treat empty/missing alike and fall back to the local registry bio.
    const twitchDescription = user && user.description ? user.description : null;
    // Recent past video used for the offline "latest content" preview.
    const video = user && user.id ? videos.get(String(user.id)) : null;

    return {
      // Prefer Twitch's canonical display_name (proper casing) when available.
      displayName: (user && user.display_name) || streamer.displayName,
      twitchUsername: streamer.twitchUsername,
      twitchUrl: streamer.twitchUrl,
      discordName: streamer.discordName,
      bio: twitchDescription || streamer.bio,
      twitchDescription,
      localBio: streamer.bio,
      preferredGames: Array.isArray(streamer.preferredGames) ? streamer.preferredGames : [],
      featured: Boolean(streamer.featured),
      isLive,
      streamTitle: isLive ? stream.title || null : null,
      gameName: isLive ? stream.game_name || null : null,
      viewerCount: isLive && typeof stream.viewer_count === 'number' ? stream.viewer_count : null,
      thumbnailUrl: isLive ? templateThumbnail(stream.thumbnail_url) : null,
      startedAt: isLive ? stream.started_at || null : null,
      avatarUrl: streamer.avatar || (user && user.profile_image_url) || null,
      // Most recent past video (offline "latest content"). Null when none exists.
      latestVideoTitle: video && video.title ? video.title : null,
      latestVideoUrl: video && video.url ? video.url : null,
      latestVideoThumbnailUrl: video ? templateThumbnail(video.thumbnail_url) : null,
      latestVideoCreatedAt: video && video.created_at ? video.created_at : null
    };
  });
}

// Sort: live first -> featured next -> then the rest in registry order.
function sortStreamers(list) {
  return list
    .map((streamer, index) => ({ streamer, index }))
    .sort((a, b) => {
      const liveDelta = Number(b.streamer.isLive) - Number(a.streamer.isLive);
      if (liveDelta !== 0) return liveDelta;
      const featuredDelta = Number(b.streamer.featured) - Number(a.streamer.featured);
      if (featuredDelta !== 0) return featuredDelta;
      return a.index - b.index; // stable: preserve registry order within a tier
    })
    .map((entry) => entry.streamer);
}

function buildOfflineResult(reason) {
  const offline = normalizeStreamers(alchemistStreamers, new Map(), new Map());
  return {
    ok: true,
    degraded: true,
    reason,
    fetchedAt: new Date().toISOString(),
    streamers: sortStreamers(offline)
  };
}

// Main entry point used by the API route. Never throws — the page must render the
// approved registry (all offline) even when Twitch is misconfigured or down.
async function getStreamersData({ ttlMs = DEFAULT_TTL_MS } = {}) {
  const now = Date.now();
  if (dataCache.data && dataCache.expiresAt > now) {
    return { ...dataCache.data, cached: true };
  }

  const credentials = getTwitchCredentials();
  if (!credentials) {
    // Missing env vars in development (or unconfigured prod): degrade gracefully.
    const result = buildOfflineResult('missing-twitch-credentials');
    dataCache = { data: result, expiresAt: now + ttlMs };
    return result;
  }

  try {
    const logins = alchemistStreamers.map((s) => String(s.twitchUsername).toLowerCase());
    let token = await getAppAccessToken(credentials);

    const auth = { clientId: credentials.clientId, token };
    let streams;
    try {
      streams = await fetchHelixStreams(logins, auth);
    } catch (error) {
      // Token may have been revoked/expired early — refresh once and retry.
      if (error instanceof TwitchHttpError && error.status === 401) {
        token = await getAppAccessToken({ ...credentials, forceRefresh: true });
        auth.token = token;
        streams = await fetchHelixStreams(logins, auth);
      } else {
        throw error;
      }
    }

    const users = await fetchHelixUsers(logins, auth);

    // Offline "latest content": fetch one recent video per user. This is a
    // best-effort enhancement layered on top of live status — if it fails we
    // log and continue with null video fields rather than degrading the page.
    let videosByUserId = new Map();
    try {
      const userIds = users.map((user) => user && user.id).filter(Boolean);
      const videos = await fetchHelixVideos(userIds, auth);
      videosByUserId = indexByUserId(videos);
    } catch (error) {
      console.error('[streamers] Twitch video fetch failed (continuing without):', error.message);
    }

    const normalized = normalizeStreamers(
      alchemistStreamers,
      indexByLogin(streams, 'user_login'),
      indexByLogin(users, 'login'),
      videosByUserId
    );

    const result = {
      ok: true,
      degraded: false,
      reason: null,
      fetchedAt: new Date().toISOString(),
      streamers: sortStreamers(normalized)
    };
    dataCache = { data: result, expiresAt: now + ttlMs };
    return result;
  } catch (error) {
    // Log server-side for observability; the client just sees a degraded payload.
    console.error('[streamers] Twitch fetch failed:', error.message);
    const result = buildOfflineResult('twitch-unavailable');
    // Cache the degraded result briefly so an outage does not hammer Twitch.
    dataCache = { data: result, expiresAt: now + ttlMs };
    return result;
  }
}

// Test helper: clear module-level caches between cases.
function _resetCachesForTests() {
  tokenCache = { token: null, expiresAt: 0 };
  dataCache = { data: null, expiresAt: 0 };
}

module.exports = {
  getAppAccessToken,
  fetchHelixStreams,
  fetchHelixUsers,
  fetchHelixVideos,
  indexByLogin,
  indexByUserId,
  templateThumbnail,
  normalizeStreamers,
  sortStreamers,
  getStreamersData,
  TwitchHttpError,
  _resetCachesForTests
};
