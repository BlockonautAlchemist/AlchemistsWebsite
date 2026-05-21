const { clientPreview, generatePreview } = require('../../server/vision-forge/preview');
const {
  configuredModel,
  hasOpenRouterApiKey
} = require('../../server/vision-forge/openRouter');
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

const ROUTE_NAME = 'api/vision-forge/post-preview';

function safeLog(event, details = {}) {
  const payload = {
    route: ROUTE_NAME,
    event,
    ...details
  };

  try {
    console.info(JSON.stringify(payload));
  } catch (error) {
    console.info(`[${ROUTE_NAME}] ${event}`);
  }
}

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  try {
    assertPost(req);
    const body = await readJsonBody(req);
    safeLog('request', {
      body_keys: body && typeof body === 'object' ? Object.keys(body).sort() : [],
      model: configuredModel(),
      openrouter_api_key_configured: hasOpenRouterApiKey()
    });

    const payload = validateChatPayload(body);

    // Fail fast (before any model call) if posting cannot be signed.
    assertSigningConfigured();

    enforceRateLimit(req, 'vision-forge-preview', {
      limit: 5,
      windowMs: 60 * 1000
    });

    const preview = await generatePreview(payload, {
      onDiagnostic: (event, details) => {
        safeLog(event, details);
      }
    });
    const publicPreview = clientPreview(preview);
    const token = signPreview(preview);

    safeLog('preview_ready', {
      fallback_reasons: Array.isArray(preview.preview_fallback_reasons)
        ? preview.preview_fallback_reasons
        : [],
      discord_post_length: publicPreview.discord_post.length,
      can_post: Boolean(preview.can_post)
    });

    sendJson(res, 200, {
      ok: true,
      preview: publicPreview,
      token
    });
  } catch (error) {
    safeLog('error', {
      status_code: error && error.statusCode ? error.statusCode : 500,
      error_name: error && error.name ? error.name : 'Error',
      detail_keys: error && error.details && typeof error.details === 'object'
        ? Object.keys(error.details).sort()
        : []
    });
    sendError(res, error);
  }
};
