const crypto = require('node:crypto');
const { ApiError } = require('../../server/vision-forge/errors');
const {
  handleOptions,
  readJsonBody,
  sendError,
  sendJson
} = require('../../server/command-center/http');
const { commandCenterStorageError } = require('../../server/command-center/errors');
const { createTelemetry } = require('../../server/command-center/telemetry');
const { validateTelemetryPayload } = require('../../server/command-center/validation');

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 120;
const rateWindows = new Map();

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
  const secret = process.env.COMMAND_CENTER_INGEST_SECRET;

  if (!secret) {
    throw new ApiError(503, 'Command Center ingest is not configured yet. Add COMMAND_CENTER_INGEST_SECRET in Vercel Environment Variables.');
  }

  const token = bearerToken(req);
  if (!secureEqual(token, secret)) {
    throw new ApiError(401, 'Invalid or missing Command Center ingest token.');
  }

  return token;
}

function rateLimitKey(token) {
  return crypto
    .createHash('sha256')
    .update(token)
    .digest('hex')
    .slice(0, 24);
}

function enforceRateLimit(token, now = Date.now()) {
  const key = rateLimitKey(token);
  const current = rateWindows.get(key);

  if (!current || now - current.startedAt >= RATE_LIMIT_WINDOW_MS) {
    rateWindows.set(key, { startedAt: now, count: 1 });
    return;
  }

  current.count += 1;
  if (current.count > RATE_LIMIT_MAX) {
    throw new ApiError(429, 'Command Center ingest rate limit exceeded.');
  }
}

module.exports = async function handler(req, res) {
  if (handleOptions(req, res, 'POST, OPTIONS')) return;

  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS');
      throw new ApiError(405, 'Use POST for the Command Center telemetry endpoint.');
    }

    const token = requireIngestAuth(req);
    enforceRateLimit(token);
    const body = await readJsonBody(req);
    const telemetry = validateTelemetryPayload(body);
    const result = await createTelemetry(telemetry);

    sendJson(res, result.status === 'created' ? 201 : 200, {
      success: true,
      id: result.id,
      status: result.status,
      agent: result.agent,
      workflow: result.workflow
    }, {
      'Cache-Control': 'no-store'
    });
  } catch (error) {
    sendError(res, commandCenterStorageError(error));
  }
};
