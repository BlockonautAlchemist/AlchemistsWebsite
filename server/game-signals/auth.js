const { ApiError } = require('../shared/errors');
const { sanitizeText } = require('../shared/validation');

function bearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function requestSecret(req, body = {}) {
  return sanitizeText(
    bearerToken(req)
      || req.headers['x-game-signal-secret']
      || req.headers['x-publish-secret']
      || body.secret,
    240
  );
}

function requirePublishSecret(req, body = {}) {
  const configured = process.env.GAME_SIGNAL_PUBLISH_SECRET;

  if (!configured || !configured.trim()) {
    throw new ApiError(503, 'Signal publishing automation is not configured yet.');
  }

  const provided = requestSecret(req, body);

  if (!provided || provided !== configured.trim()) {
    throw new ApiError(401, 'Signal publishing is not authorized.');
  }
}

module.exports = {
  requirePublishSecret
};
