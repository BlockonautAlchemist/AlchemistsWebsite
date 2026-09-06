const { ApiError } = require('../../server/vision-forge/errors');
const { handleOptions, sendError, sendJson } = require('../../server/command-center/http');
const { commandCenterStorageError } = require('../../server/command-center/errors');
const { listPublicRunHistory } = require('../../server/command-center/telemetry');
const { validateHistoryQuery } = require('../../server/command-center/validation');

function getQuery(req) {
  const url = new URL(req.url || '/api/command-center/history', 'http://localhost');
  return Object.fromEntries(url.searchParams.entries());
}

module.exports = async function handler(req, res) {
  if (handleOptions(req, res, 'GET, OPTIONS')) return;
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET, OPTIONS');
      throw new ApiError(405, 'Use GET for the Command Center history endpoint.');
    }
    const filters = validateHistoryQuery(getQuery(req));
    const fetchedAt = new Date().toISOString();
    const history = await listPublicRunHistory({ ...filters, now: Date.parse(fetchedAt) });
    sendJson(res, 200, { success: true, fetchedAt, ...history }, {
      'Cache-Control': 'public, max-age=0, s-maxage=5, stale-while-revalidate=20'
    });
  } catch (error) {
    sendError(res, commandCenterStorageError(error));
  }
};
