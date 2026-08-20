const { ApiError } = require('../vision-forge/errors');

const MAX_BODY_BYTES = 24 * 1024;

function setJsonHeaders(res, headers = {}) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  Object.entries(headers).forEach(([name, value]) => {
    res.setHeader(name, value);
  });
}

function sendJson(res, statusCode, payload, headers = {}) {
  setJsonHeaders(res, headers);
  res.statusCode = statusCode;
  res.end(JSON.stringify(payload));
}

function sendError(res, error) {
  const isKnown = error instanceof ApiError;
  const statusCode = isKnown ? error.statusCode : 500;

  if (!isKnown) {
    console.error('[command-center] unexpected server error:', error);
  }

  sendJson(res, statusCode, {
    success: false,
    error: isKnown ? error.message : 'Command Center hit an unexpected server error.',
    details: isKnown ? error.details : {}
  }, {
    'Cache-Control': 'no-store'
  });
}

function handleOptions(req, res, allow) {
  if (req.method !== 'OPTIONS') return false;

  res.setHeader('Allow', allow);
  res.statusCode = 204;
  res.end();
  return true;
}

function parseJson(raw) {
  if (!raw || !raw.trim()) return {};

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new ApiError(400, 'Request body must be valid JSON.');
  }
}

function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') {
    return Promise.resolve(req.body);
  }

  if (typeof req.body === 'string') {
    if (Buffer.byteLength(req.body, 'utf8') > MAX_BODY_BYTES) {
      throw new ApiError(413, 'Command Center ingest requests must stay under 24KB.');
    }

    return Promise.resolve(parseJson(req.body));
  }

  return new Promise((resolve, reject) => {
    let raw = '';
    let totalBytes = 0;

    req.on('data', (chunk) => {
      totalBytes += chunk.length;

      if (totalBytes > MAX_BODY_BYTES) {
        reject(new ApiError(413, 'Command Center ingest requests must stay under 24KB.'));
        req.destroy();
        return;
      }

      raw += chunk.toString('utf8');
    });

    req.on('error', reject);
    req.on('end', () => {
      try {
        resolve(parseJson(raw));
      } catch (error) {
        reject(error);
      }
    });
  });
}

module.exports = {
  handleOptions,
  readJsonBody,
  sendError,
  sendJson
};
