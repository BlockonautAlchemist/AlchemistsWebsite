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
    startedAt: null,
    avatarUrl: streamer.avatar || null
  }));
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

export function formatViewers(count) {
  if (typeof count !== 'number' || Number.isNaN(count) || count < 0) return null;
  if (count < 1000) return String(count);
  const thousands = count / 1000;
  const rounded = thousands >= 100 ? Math.round(thousands) : Math.round(thousands * 10) / 10;
  return `${rounded}K`;
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
