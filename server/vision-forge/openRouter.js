const { ApiError } = require('./errors');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-5.2';

function getReferer() {
  if (process.env.SITE_URL) return process.env.SITE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'https://thealchemistsguild.com';
}

function configuredModel() {
  return process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
}

function hasOpenRouterApiKey() {
  return Boolean(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.trim());
}

function emitDiagnostic(options, event, details = {}) {
  if (typeof options.onDiagnostic !== 'function') return;

  try {
    options.onDiagnostic(event, details);
  } catch (error) {
    // Diagnostics must never break the user-facing API path.
  }
}

function responseShape(data) {
  const choice = data && Array.isArray(data.choices) ? data.choices[0] : null;
  const message = choice && choice.message ? choice.message : null;
  const content = message ? message.content : undefined;

  return {
    top_level_keys: data && typeof data === 'object' ? Object.keys(data).slice(0, 12) : [],
    has_choices: Boolean(data && Array.isArray(data.choices)),
    choice_count: data && Array.isArray(data.choices) ? data.choices.length : 0,
    first_choice_has_message: Boolean(message),
    content_type: content === null ? 'null' : typeof content,
    content_length: typeof content === 'string' ? content.length : 0,
    has_error: Boolean(data && data.error)
  };
}

async function callOpenRouter(options) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!hasOpenRouterApiKey()) {
    throw new ApiError(503, 'Vision Forge AI is not configured yet. Add OPENROUTER_API_KEY in Vercel Environment Variables.');
  }

  const body = {
    model: configuredModel(),
    messages: options.messages,
    temperature: options.temperature ?? 0.35,
    max_tokens: options.maxTokens ?? 700
  };

  if (options.responseFormat) {
    body.response_format = options.responseFormat;
  }

  emitDiagnostic(options, 'openrouter_request', {
    model: body.model,
    has_response_format: Boolean(body.response_format),
    message_count: Array.isArray(body.messages) ? body.messages.length : 0
  });

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': getReferer(),
      'X-OpenRouter-Title': 'The Alchemists Vision Forge'
    },
    body: JSON.stringify(body)
  }).catch(() => {
    emitDiagnostic(options, 'openrouter_transport_error', {
      status_code: null
    });
    throw new ApiError(502, 'Vision Forge AI could not be reached. Try again shortly.');
  });

  const raw = await response.text();
  let data = {};

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch (error) {
    emitDiagnostic(options, 'openrouter_unreadable_response', {
      status_code: response.status,
      response_shape: {
        raw_length: raw.length,
        parseable_json: false
      }
    });
    throw new ApiError(502, 'Vision Forge AI returned an unreadable response.');
  }

  const shape = responseShape(data);

  emitDiagnostic(options, 'openrouter_response', {
    status_code: response.status,
    ok: response.ok,
    response_shape: shape
  });

  if (!response.ok) {
    throw new ApiError(502, 'Vision Forge AI returned an error. Try again shortly.', {
      upstream_status: response.status,
      response_shape: shape
    });
  }

  const choice = data.choices && data.choices[0];
  const content = choice && choice.message ? choice.message.content : '';

  if (!content || typeof content !== 'string') {
    if (options.allowEmptyContent) {
      return '';
    }

    throw new ApiError(502, 'Vision Forge AI returned an empty response. Try again.');
  }

  return content.trim();
}

module.exports = {
  callOpenRouter,
  configuredModel,
  hasOpenRouterApiKey
};
