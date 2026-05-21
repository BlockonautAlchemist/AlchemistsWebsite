const {
  assertMethod,
  handleOptions,
  sendError,
  sendJson
} = require('../../server/shared/http');
const { ApiError } = require('../../server/shared/errors');
const { getSignal, listSignals } = require('../../server/game-signals/storage');
const { validateSlugInput } = require('../../server/game-signals/validation');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res, ['GET'])) return;

  try {
    assertMethod(req, 'GET');

    if (req.query && req.query.slug) {
      const slug = validateSlugInput(Array.isArray(req.query.slug) ? req.query.slug[0] : req.query.slug);
      const signal = getSignal(slug);

      if (!signal) {
        throw new ApiError(404, 'Game signal not found.');
      }

      sendJson(res, 200, {
        ok: true,
        signal
      });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      signals: listSignals()
    });
  } catch (error) {
    sendError(res, error, {
      fallbackMessage: 'Game Signal Engine could not load signals.'
    });
  }
};
