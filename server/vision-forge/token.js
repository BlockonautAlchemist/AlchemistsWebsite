const crypto = require('node:crypto');
const { ApiError } = require('./errors');
const { normalizePreview } = require('./validation');
const { evaluatePreview } = require('./preview');

// Dedicated server-only secret. No fallback: posting must fail loudly if it is
// not configured rather than silently use a guessable/client-visible value.
function getSigningSecret() {
  const secret = process.env.VISION_FORGE_SIGNING_SECRET;

  if (!secret || !secret.trim()) {
    throw new ApiError(
      503,
      'Vision Forge posting is not configured: set VISION_FORGE_SIGNING_SECRET in environment variables.'
    );
  }

  return secret;
}

function hmac(payloadB64) {
  return crypto
    .createHmac('sha256', getSigningSecret())
    .update(payloadB64)
    .digest('base64url');
}

// Sign the server-generated preview so the post endpoint can post the exact
// previewed content without re-running the model and without trusting the client.
function signPreview(preview) {
  const payloadB64 = Buffer.from(JSON.stringify(preview), 'utf8').toString('base64url');
  return `${payloadB64}.${hmac(payloadB64)}`;
}

function safeEqual(a, b) {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');

  if (bufA.length !== bufB.length) return false;

  return crypto.timingSafeEqual(bufA, bufB);
}

function verifyPreviewToken(token) {
  const invalid = new ApiError(400, 'Invalid or expired preview token. Regenerate the preview.');

  if (typeof token !== 'string' || !token.includes('.')) {
    throw invalid;
  }

  const [payloadB64, signature] = token.split('.');

  if (!payloadB64 || !signature || !safeEqual(signature, hmac(payloadB64))) {
    throw invalid;
  }

  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch (error) {
    throw invalid;
  }

  // Re-derive eligibility server-side; never trust can_post from the blob.
  const normalized = normalizePreview(parsed, parsed && parsed.submitted_by);
  return evaluatePreview(normalized, parsed && parsed.clear_connection, {
    requiredFieldsSynthesized: Boolean(parsed && parsed.required_fields_synthesized)
  });
}

module.exports = {
  assertSigningConfigured: getSigningSecret,
  signPreview,
  verifyPreviewToken
};
