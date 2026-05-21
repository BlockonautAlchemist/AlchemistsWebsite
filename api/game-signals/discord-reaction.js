const { ApiError } = require('../../server/shared/errors');
const {
  assertMethod,
  handleOptions,
  readJsonBody,
  sendError,
  sendJson
} = require('../../server/shared/http');
const { requirePublishSecret } = require('../../server/game-signals/auth');
const {
  getSignal,
  markCommunityApproved,
  publishSignal,
  setReactionCount
} = require('../../server/game-signals/storage');
const {
  autoPublishEnabled,
  hasMetReactionThreshold,
  reactionThreshold
} = require('../../server/game-signals/threshold');
const {
  validateReactionCount,
  validateSlugInput
} = require('../../server/game-signals/validation');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res, ['POST'])) return;

  try {
    assertMethod(req, 'POST');
    const body = await readJsonBody(req);
    requirePublishSecret(req, body);

    const slug = validateSlugInput(body.slug);
    const reactionCount = validateReactionCount(body.reaction_count);
    let signal = getSignal(slug);

    if (!signal || signal.sample_signal) {
      throw new ApiError(404, 'Game signal not found.');
    }

    signal = setReactionCount(slug, reactionCount);

    const threshold = reactionThreshold();
    const thresholdMet = hasMetReactionThreshold(reactionCount);
    let autoPublished = false;

    if (thresholdMet && signal.status !== 'published') {
      signal = markCommunityApproved(slug);
    }

    if (thresholdMet && autoPublishEnabled()) {
      signal = publishSignal(slug);
      autoPublished = signal.status === 'published';
    }

    sendJson(res, 200, {
      ok: true,
      signal,
      threshold,
      threshold_met: thresholdMet,
      auto_published: autoPublished
    });
  } catch (error) {
    sendError(res, error, {
      fallbackMessage: 'Game Signal Engine could not process this reaction event.'
    });
  }
};
