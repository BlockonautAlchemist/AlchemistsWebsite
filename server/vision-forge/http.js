const { ApiError } = require('./errors');

const MAX_BODY_BYTES = 24 * 1024;

function setJsonHeaders(res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
}

function sendJson(res, statusCode, payload) {
  setJsonHeaders(res);
  res.statusCode = statusCode;
  res.end(JSON.stringify(payload));
}

function sendError(res, error) {
  const statusCode = error instanceof ApiError ? error.statusCode : 500;
  const message = error instanceof ApiError
    ? error.message
    : 'Vision Forge hit an unexpected server error.';

  sendJson(res, statusCode, {
    ok: false,
    error: message,
    details: error instanceof ApiError ? error.details : {}
  });
}

function handleOptions(req, res) {
  if (req.method !== 'OPTIONS') return false;

  res.setHeader('Allow', 'POST, OPTIONS');
  res.statusCode = 204;
  res.end();
  return true;
}

function assertPost(req) {
  if (req.method !== 'POST') {
    throw new ApiError(405, 'Use POST for this Vision Forge endpoint.');
  }
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
    return Promise.resolve(parseJson(req.body));
  }

  return new Promise((resolve, reject) => {
    let raw = '';
    let totalBytes = 0;

    req.on('data', (chunk) => {
      totalBytes += chunk.length;

      if (totalBytes > MAX_BODY_BYTES) {
        reject(new ApiError(413, 'Vision Forge requests must stay under 24KB.'));
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
  assertPost,
  handleOptions,
  readJsonBody,
  sendError,
  sendJson
};
