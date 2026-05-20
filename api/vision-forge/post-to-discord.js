const { postToDiscord } = require('../../server/vision-forge/discord');
const { clientPreview, generatePreview } = require('../../server/vision-forge/preview');
const { enforceRateLimit } = require('../../server/vision-forge/rateLimit');
const {
  assertPost,
  handleOptions,
  readJsonBody,
  sendError,
  sendJson
} = require('../../server/vision-forge/http');
const { validateVisionPayload } = require('../../server/vision-forge/validation');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  try {
    assertPost(req);
    const body = await readJsonBody(req);
    const payload = validateVisionPayload(body);

    enforceRateLimit(req, 'vision-forge-post', {
      limit: 2,
      windowMs: 10 * 60 * 1000
    });

    const preview = await generatePreview(payload);
    const publicPreview = clientPreview(preview);

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
      message: 'Idea posted to Discord.'
    });
  } catch (error) {
    sendError(res, error);
  }
};
