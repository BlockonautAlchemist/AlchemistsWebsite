// GET /api/streamers — secure, server-side Twitch live-status for the Streamers Hub.
//
// Required environment variables (server-only secrets, never exposed to the client):
//   TWITCH_CLIENT_ID      — Twitch app client id      (https://dev.twitch.tv/console)
//   TWITCH_CLIENT_SECRET  — Twitch app client secret  (treat like a password)
// When they are absent the route still responds 200 with the approved registry
// marked offline (degraded), so the page never crashes in local dev.
//
// All Twitch auth + fetching happens in server/streamers/twitch.js. This handler
// stays thin: method-guard, fetch normalized data, send JSON with CDN cache headers.

const { ApiError } = require('../server/vision-forge/errors');
const { sendError } = require('../server/vision-forge/http');
const { getStreamersData } = require('../server/streamers/twitch');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET, OPTIONS');
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    if (req.method !== 'GET') {
      throw new ApiError(405, 'Use GET for the streamers endpoint.');
    }

    const data = await getStreamersData();

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // Shared CDN cache layer (in addition to the in-memory cache in twitch.js):
    // serve cached live status for ~90s, then revalidate in the background.
    res.setHeader('Cache-Control', 'public, s-maxage=90, stale-while-revalidate=180');
    res.statusCode = 200;
    res.end(JSON.stringify(data));
  } catch (error) {
    sendError(res, error);
  }
};
