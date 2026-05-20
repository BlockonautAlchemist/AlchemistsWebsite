const { clientPreview, generatePreview } = require('../../server/vision-forge/preview');
const { assertSigningConfigured, signPreview } = require('../../server/vision-forge/token');
const { enforceRateLimit } = require('../../server/vision-forge/rateLimit');
const {
  assertPost,
  handleOptions,
  readJsonBody,
  sendError,
  sendJson
} = require('../../server/vision-forge/http');
const { validateChatPayload } = require('../../server/vision-forge/validation');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  try {
    assertPost(req);
    const body = await readJsonBody(req);
    const payload = validateChatPayload(body);

    // Fail fast (before any model call) if posting cannot be signed.
    assertSigningConfigured();

    enforceRateLimit(req, 'vision-forge-preview', {
      limit: 5,
      windowMs: 60 * 1000
    });

    const preview = await generatePreview(payload);

    sendJson(res, 200, {
      ok: true,
      preview: clientPreview(preview),
      token: signPreview(preview)
    });
  } catch (error) {
    sendError(res, error);
  }
};
