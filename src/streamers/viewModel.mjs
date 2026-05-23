// Shared presentation helpers for the Streamers Hub browser entry and tests.

export function baselineFromRegistry(registry) {
  return registry.map((streamer) => ({
    displayName: streamer.displayName,
    twitchUsername: streamer.twitchUsername,
    twitchUrl: streamer.twitchUrl,
    discordName: streamer.discordName,
    bio: streamer.bio,
    twitchDescription: null,
    localBio: streamer.bio,
    preferredGames: Array.isArray(streamer.preferredGames) ? streamer.preferredGames : [],
    featured: Boolean(streamer.featured),
    isLive: false,
    streamTitle: null,
    gameName: null,
    viewerCount: null,
    thumbnailUrl: null,
    liveThumbnailUrl: null,
    startedAt: null,
    avatarUrl: streamer.avatar || null,
    offlineImageUrl: null,
    latestVideoId: null,
    latestVideoType: null,
    latestVideoTitle: null,
    latestVideoUrl: null,
    latestVideoThumbnailUrl: null,
    latestVideoCreatedAt: null,
    // Pre-API baseline: everyone is offline with no recent video -> branded fallback.
    mediaType: 'fallback',
    mediaPreviewUrl: streamer.avatar || null,
    embedUrl: null
  }));
}

// Server-side embed URLs carry a REPLACE_WITH_DOMAIN placeholder for the Twitch
// `parent` (which must match the host serving the page). Swap in the live hostname
// here so the same payload works on localhost, Vercel previews, and production.
export function resolveEmbedUrl(embedUrl, hostname) {
  const host = String(hostname || '').trim();
  if (!embedUrl || !host) return null;
  return String(embedUrl).replace('REPLACE_WITH_DOMAIN', host);
}

export function sortStreamers(list) {
  return list
    .map((streamer, index) => ({ streamer, index }))
    .sort((a, b) => {
      const liveDelta = Number(b.streamer.isLive) - Number(a.streamer.isLive);
      if (liveDelta !== 0) return liveDelta;
      const featuredDelta = Number(b.streamer.featured) - Number(a.streamer.featured);
      if (featuredDelta !== 0) return featuredDelta;
      return a.index - b.index;
    })
    .map((entry) => entry.streamer);
}

export function selectActiveStreamer(list, preferredUsername = null) {
  const sorted = sortStreamers(Array.isArray(list) ? list : []);
  const preferred = normalizeLogin(preferredUsername);

  if (preferred) {
    const match = sorted.find((streamer) => normalizeLogin(streamer.twitchUsername) === preferred);
    if (match) return match;
  }

  return sorted[0] || null;
}

export function formatViewers(count) {
  if (typeof count !== 'number' || Number.isNaN(count) || count < 0) return null;
  if (count < 1000) return String(count);
  const thousands = count / 1000;
  const rounded = thousands >= 100 ? Math.round(thousands) : Math.round(thousands * 10) / 10;
  return `${rounded}K`;
}

export function viewerCountLabel(streamer) {
  const viewers = formatViewers(streamer && streamer.viewerCount);
  return viewers ? `${viewers} watching` : null;
}

export function streamStatusLabel(streamer) {
  return streamer && streamer.isLive ? 'Live now' : 'Offline';
}

export function compactStreamerTags(streamer, limit = 3) {
  const max = Math.max(0, Number(limit) || 0);
  const tags = [];
  const seen = new Set();

  function add(value) {
    const tag = String(value || '').trim();
    const key = tag.toLowerCase();
    if (!tag || seen.has(key) || tags.length >= max) return;
    seen.add(key);
    tags.push(tag);
  }

  add(streamer && streamer.gameName);
  const preferredGames = streamer && Array.isArray(streamer.preferredGames) ? streamer.preferredGames : [];
  preferredGames.forEach(add);
  return tags;
}

export function streamCategoryLabel(streamer) {
  return (streamer && streamer.gameName) || compactStreamerTags(streamer, 1)[0] || 'Alchemist Stream';
}

export function monogram(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function isPreferredGameList(value) {
  return Array.isArray(value);
}

// Builds an official Twitch player URL. Pass `channel` for a live stream, or
// `video` (a Twitch VOD id) to play recent past content. `parent` (the embedding
// host) is always required. Channel-only output is kept stable for callers/tests.
export function buildTwitchEmbedUrl({ channel, video, parent, autoplay = true, muted = true } = {}) {
  const host = String(parent || '').trim();
  if (!host) return null;

  const videoId = String(video || '').trim().replace(/^v/i, '');
  if (videoId) {
    const url = new URL('https://player.twitch.tv/');
    url.searchParams.set('video', videoId);
    url.searchParams.set('parent', host);
    url.searchParams.set('muted', String(Boolean(muted)));
    url.searchParams.set('autoplay', String(Boolean(autoplay)));
    return url.toString();
  }

  const login = normalizeLogin(channel);
  if (!login) return null;

  const url = new URL('https://player.twitch.tv/');
  url.searchParams.set('channel', login);
  url.searchParams.set('parent', host);
  url.searchParams.set('muted', String(Boolean(muted)));
  url.searchParams.set('autoplay', String(Boolean(autoplay)));
  return url.toString();
}

// Extracts a Twitch VOD id from a video URL or raw id. Twitch video URLs look
// like https://www.twitch.tv/videos/123456789 and the player wants just the id.
export function twitchVideoId(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const fromUrl = raw.match(/\/videos\/(\d+)/);
  if (fromUrl) return fromUrl[1];
  const digits = raw.replace(/^v/i, '');
  return /^\d+$/.test(digits) ? digits : null;
}

// Compact "x ago" label for offline VOD timestamps. Returns null for bad input.
export function relativeTimeLabel(value, now = Date.now()) {
  const then = Date.parse(value);
  if (Number.isNaN(then)) return null;
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60]
  ];
  for (const [name, size] of units) {
    const value = Math.floor(seconds / size);
    if (value >= 1) return `${value} ${name}${value === 1 ? '' : 's'} ago`;
  }
  return 'just now';
}

function normalizeLogin(value) {
  return String(value || '').trim().toLowerCase();
}
