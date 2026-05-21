const { ApiError } = require('./errors');

const DEFAULT_MAX_BODY_BYTES = 32 * 1024;

function setJsonHeaders(res, options = {}) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', options.cacheControl || 'no-store');
}

function sendJson(res, statusCode, payload, options = {}) {
  setJsonHeaders(res, options);
  res.statusCode = statusCode;
  res.end(JSON.stringify(payload));
}

function sendError(res, error, options = {}) {
  const statusCode = error instanceof ApiError ? error.statusCode : 500;
  const message = error instanceof ApiError
    ? error.message
    : options.fallbackMessage || 'The request could not be completed.';

  sendJson(res, statusCode, {
    ok: false,
    error: message,
    details: error instanceof ApiError ? error.details : {}
  });
}

function handleOptions(req, res, methods = ['GET', 'POST']) {
  if (req.method !== 'OPTIONS') return false;

  res.setHeader('Allow', [...methods, 'OPTIONS'].join(', '));
  res.statusCode = 204;
  res.end();
  return true;
}

function assertMethod(req, allowedMethods) {
  const methods = Array.isArray(allowedMethods) ? allowedMethods : [allowedMethods];

  if (!methods.includes(req.method)) {
    throw new ApiError(405, `Use ${methods.join(' or ')} for this endpoint.`);
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

function readJsonBody(req, options = {}) {
  const maxBytes = options.maxBytes || DEFAULT_MAX_BODY_BYTES;

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

      if (totalBytes > maxBytes) {
        reject(new ApiError(413, 'Requests must stay under 32KB.'));
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
  assertMethod,
  handleOptions,
  readJsonBody,
  sendError,
  sendJson,
  setJsonHeaders
};
