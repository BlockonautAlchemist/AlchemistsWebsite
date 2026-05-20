const { postToDiscord } = require('../../server/vision-forge/discord');
const { clientPreview } = require('../../server/vision-forge/preview');
const { verifyPreviewToken } = require('../../server/vision-forge/token');
const { enforceRateLimit } = require('../../server/vision-forge/rateLimit');
const {
  assertPost,
  handleOptions,
  readJsonBody,
  sendError,
  sendJson
} = require('../../server/vision-forge/http');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  try {
    assertPost(req);
    const body = await readJsonBody(req);

    // Only a token signed by /post-preview is accepted. Eligibility is recomputed
    // server-side inside verifyPreviewToken, so the client cannot forge a post.
    const preview = verifyPreviewToken(body.token);
    const publicPreview = clientPreview(preview);

    enforceRateLimit(req, 'vision-forge-post', {
      limit: 2,
      windowMs: 10 * 60 * 1000
    });

    if (!preview.can_post) {
      sendJson(res, 422, {
        ok: false,
        error: preview.posting_blocked_reason || 'This idea needs refinement before it can be posted to Discord.',
        preview: publicPreview
      });
      return;
    }

    await postToDiscord(preview);

    sendJson(res, 200, {
      ok: true,
      preview: publicPreview,
      message: 'Your idea was posted to #vision-forge.'
    });
  } catch (error) {
    sendError(res, error);
  }
};
