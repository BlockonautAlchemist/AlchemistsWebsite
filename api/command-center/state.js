const { ApiError } = require('../../server/vision-forge/errors');
const {
  handleOptions,
  sendError,
  sendJson
} = require('../../server/command-center/http');
const { commandCenterStorageError } = require('../../server/command-center/errors');
const { listPublicCommandCenterState } = require('../../server/command-center/telemetry');
const { validateStateQuery } = require('../../server/command-center/validation');

function getQuery(req) {
  const url = new URL(req.url || '/api/command-center/state', 'http://localhost');
  return Object.fromEntries(url.searchParams.entries());
}

module.exports = async function handler(req, res) {
  if (handleOptions(req, res, 'GET, OPTIONS')) return;

  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET, OPTIONS');
      throw new ApiError(405, 'Use GET for the Command Center state endpoint.');
    }

    const filters = validateStateQuery(getQuery(req));
    const fetchedAt = new Date().toISOString();
    const state = await listPublicCommandCenterState({
      historyLimit: filters.historyLimit,
      now: Date.parse(fetchedAt)
    });

    sendJson(res, 200, {
      success: true,
      fetchedAt,
      workflows: state.workflows,
      recentHistory: state.recentHistory
    }, {
      'Cache-Control': 'public, max-age=0, s-maxage=5, stale-while-revalidate=20'
    });
  } catch (error) {
    sendError(res, commandCenterStorageError(error));
  }
};
