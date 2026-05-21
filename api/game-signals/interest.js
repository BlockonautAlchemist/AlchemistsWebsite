const { ApiError } = require('../../server/shared/errors');
const {
  assertMethod,
  handleOptions,
  readJsonBody,
  sendError,
  sendJson
} = require('../../server/shared/http');
const { enforceRateLimit } = require('../../server/shared/rateLimit');
const { incrementInterest } = require('../../server/game-signals/storage');
const { validateSlugInput } = require('../../server/game-signals/validation');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res, ['POST'])) return;

  try {
    assertMethod(req, 'POST');
    enforceRateLimit(req, 'game-signal-interest', {
      limit: 20,
      windowMs: 60 * 1000
    });

    const body = await readJsonBody(req);
    const slug = validateSlugInput(body.slug);
    const signal = incrementInterest(slug);

    if (!signal) {
      throw new ApiError(404, 'Game signal not found.');
    }

    sendJson(res, 200, {
      ok: true,
      signal
    });
  } catch (error) {
    sendError(res, error, {
      fallbackMessage: 'Game Signal Engine could not update interest.'
    });
  }
};
