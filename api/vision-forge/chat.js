const { callOpenRouter } = require('../../server/vision-forge/openRouter');
const { buildCollaboratorMessages } = require('../../server/vision-forge/prompts');
const { enforceRateLimit } = require('../../server/vision-forge/rateLimit');
const {
  assertPost,
  handleOptions,
  readJsonBody,
  sendError,
  sendJson
} = require('../../server/vision-forge/http');
const {
  LIMITS,
  sanitizeText,
  validateChatPayload
} = require('../../server/vision-forge/validation');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  try {
    assertPost(req);
    const body = await readJsonBody(req);
    const payload = validateChatPayload(body, { requireConversation: true });

    enforceRateLimit(req, 'vision-forge-chat', {
      limit: 8,
      windowMs: 60 * 1000
    });

    const reply = await callOpenRouter({
      messages: buildCollaboratorMessages(payload),
      temperature: 0.45,
      maxTokens: 900
    });

    sendJson(res, 200, {
      ok: true,
      reply: sanitizeText(reply, LIMITS.assistantMessage, {
        preserveNewlines: true,
        truncateAt: 'natural'
      })
    });
  } catch (error) {
    sendError(res, error);
  }
};
