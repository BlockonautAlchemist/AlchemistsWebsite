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
    let signal = getSignal(slug);

    if (!signal || signal.sample_signal) {
      throw new ApiError(404, 'Game signal not found.');
    }

    const threshold = reactionThreshold();
    const hasReactionCount = body.reaction_count !== undefined;
    const reactionCount = hasReactionCount ? validateReactionCount(body.reaction_count) : signal.reaction_count;

    if (hasReactionCount) {
      signal = setReactionCount(slug, reactionCount);
    }

    const thresholdMet = hasMetReactionThreshold(reactionCount);
    const shouldPublish = body.publish !== false && (body.force === true || thresholdMet || !hasReactionCount);

    if (thresholdMet && signal.status !== 'published') {
      signal = markCommunityApproved(slug);
    }

    if (shouldPublish) {
      signal = publishSignal(slug);
    }

    sendJson(res, 200, {
      ok: true,
      signal,
      threshold,
      threshold_met: thresholdMet,
      published: signal.status === 'published'
    });
  } catch (error) {
    sendError(res, error, {
      fallbackMessage: 'Game Signal Engine could not publish this signal.'
    });
  }
};
