const crypto = require('node:crypto');
const { ApiError } = require('../../server/vision-forge/errors');
const {
  handleOptions,
  readJsonBody,
  sendError,
  sendJson
} = require('../../server/terminal/http');
const {
  createSignal,
  listSignals
} = require('../../server/terminal/signals');
const {
  validateListQuery,
  validateTerminalSignalPayload
} = require('../../server/terminal/validation');

function getQuery(req) {
  const url = new URL(req.url || '/api/terminal/signals', 'http://localhost');
  return Object.fromEntries(url.searchParams.entries());
}

function bearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function secureEqual(actual, expected) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length) return false;

  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function requireIngestAuth(req) {
  const secret = process.env.TERMINAL_INGEST_SECRET;

  if (!secret) {
    throw new ApiError(503, 'Terminal ingest is not configured yet. Add TERMINAL_INGEST_SECRET in Vercel Environment Variables.');
  }

  if (!secureEqual(bearerToken(req), secret)) {
    throw new ApiError(401, 'Invalid or missing Terminal ingest token.');
  }
}

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  try {
    if (req.method === 'GET') {
      const filters = validateListQuery(getQuery(req));
      const signals = await listSignals(filters);

      sendJson(res, 200, {
        success: true,
        count: signals.length,
        fetchedAt: new Date().toISOString(),
        signals
      }, {
        'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=120'
      });
      return;
    }

    if (req.method === 'POST') {
      requireIngestAuth(req);
      const body = await readJsonBody(req);
      const signal = validateTerminalSignalPayload(body);
      const result = await createSignal(signal);

      sendJson(res, result.status === 'created' ? 201 : 200, {
        success: true,
        id: result.id,
        status: result.status
      }, {
        'Cache-Control': 'no-store'
      });
      return;
    }

    res.setHeader('Allow', 'GET, POST, OPTIONS');
    throw new ApiError(405, 'Use GET or POST for the Terminal signals endpoint.');
  } catch (error) {
    sendError(res, error);
  }
};
