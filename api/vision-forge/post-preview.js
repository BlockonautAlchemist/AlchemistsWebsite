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

    enforceRateLimit(req, 'vision-forge-preview', {
      limit: 5,
      windowMs: 60 * 1000
    });

    const preview = await generatePreview(payload);

    sendJson(res, 200, {
      ok: true,
      preview: clientPreview(preview)
    });
  } catch (error) {
    sendError(res, error);
  }
};
