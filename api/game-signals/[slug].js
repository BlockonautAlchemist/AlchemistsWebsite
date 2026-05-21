const { ApiError } = require('../../server/shared/errors');
const {
  assertMethod,
  handleOptions,
  sendError,
  sendJson
} = require('../../server/shared/http');
const { getSignal } = require('../../server/game-signals/storage');
const { validateSlugInput } = require('../../server/game-signals/validation');

function slugFromRequest(req) {
  if (req.query && req.query.slug) {
    return Array.isArray(req.query.slug) ? req.query.slug[0] : req.query.slug;
  }

  const pathname = String(req.url || '').split('?')[0];
  return pathname.split('/').filter(Boolean).pop();
}

module.exports = async function handler(req, res) {
  if (handleOptions(req, res, ['GET'])) return;

  try {
    assertMethod(req, 'GET');

    const slug = validateSlugInput(slugFromRequest(req));
    const signal = getSignal(slug);

    if (!signal) {
      throw new ApiError(404, 'Game signal not found.');
    }

    sendJson(res, 200, {
      ok: true,
      signal
    });
  } catch (error) {
    sendError(res, error, {
      fallbackMessage: 'Game Signal Engine could not load this signal.'
    });
  }
};
