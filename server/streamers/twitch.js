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

const DEFAULT_TTL_MS = 90 * 1000; // 60-180s window; absorbs page-load bursts.
const THUMB_WIDTH = 440;
const THUMB_HEIGHT = 248;

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

function indexByLogin(items, key) {
  const map = new Map();
  for (const item of items) {
    const login = item && item[key];
    if (typeof login === 'string') map.set(login.toLowerCase(), item);
  }
  return map;
}

function templateThumbnail(url, width = THUMB_WIDTH, height = THUMB_HEIGHT) {
  if (!url) return null;
  return url.replace('{width}', String(width)).replace('{height}', String(height));
}

// Pure: merges the registry with Twitch Helix results into the frontend shape.
function normalizeStreamers(registry, streamsByLogin, usersByLogin) {
  const streams = streamsByLogin instanceof Map ? streamsByLogin : new Map();
  const users = usersByLogin instanceof Map ? usersByLogin : new Map();

  return registry.map((streamer) => {
    const login = String(streamer.twitchUsername || '').toLowerCase();
    const stream = streams.get(login);
    const user = users.get(login);
    const isLive = Boolean(stream) && stream.type === 'live';

    return {
      displayName: streamer.displayName,
      twitchUsername: streamer.twitchUsername,
      twitchUrl: streamer.twitchUrl,
      discordName: streamer.discordName,
      bio: streamer.bio,
      preferredGames: Array.isArray(streamer.preferredGames) ? streamer.preferredGames : [],
      featured: Boolean(streamer.featured),
      isLive,
      streamTitle: isLive ? stream.title || null : null,
      gameName: isLive ? stream.game_name || null : null,
      viewerCount: isLive && typeof stream.viewer_count === 'number' ? stream.viewer_count : null,
      thumbnailUrl: isLive ? templateThumbnail(stream.thumbnail_url) : null,
      startedAt: isLive ? stream.started_at || null : null,
      avatarUrl: streamer.avatar || (user && user.profile_image_url) || null
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

    const normalized = normalizeStreamers(
      alchemistStreamers,
      indexByLogin(streams, 'user_login'),
      indexByLogin(users, 'login')
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
  indexByLogin,
  templateThumbnail,
  normalizeStreamers,
  sortStreamers,
  getStreamersData,
  TwitchHttpError,
  _resetCachesForTests
};
