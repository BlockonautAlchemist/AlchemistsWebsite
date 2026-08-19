const { ApiError } = require('../../server/vision-forge/errors');
const {
  NEWSLETTER_FALLBACK_URL,
  createBeehiivSubscription,
  validateNewsletterEmail
} = require('../../server/newsletter/beehiiv');

const MAX_BODY_BYTES = 4 * 1024;

function sendJson(res, statusCode, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.statusCode = statusCode;
  res.end(JSON.stringify(payload));
}

function sendNewsletterError(res, error) {
  const isKnown = error instanceof ApiError;
  const statusCode = isKnown ? error.statusCode : 500;

  if (!isKnown) {
    console.error('[newsletter] unexpected server error:', error);
  }

  sendJson(res, statusCode, {
    ok: false,
    error: isKnown ? error.message : 'Newsletter signup hit an unexpected server error.',
    fallbackUrl: NEWSLETTER_FALLBACK_URL
  });
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
        reject(new ApiError(413, 'Newsletter signup requests must stay under 4KB.'));
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

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS');
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS');
      throw new ApiError(405, 'Use POST for the newsletter endpoint.');
    }

    const body = await readJsonBody(req);
    const email = validateNewsletterEmail(body.email);
    const result = await createBeehiivSubscription(email);

    sendJson(res, 200, {
      ok: true,
      status: result.status,
      fallbackUrl: NEWSLETTER_FALLBACK_URL
    });
  } catch (error) {
    sendNewsletterError(res, error);
  }
};
