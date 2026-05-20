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

async function callOpenRouter(options) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new ApiError(503, 'Vision Forge AI is not configured yet. Add OPENROUTER_API_KEY in Vercel Environment Variables.');
  }

  const body = {
    model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
    messages: options.messages,
    temperature: options.temperature ?? 0.35,
    max_tokens: options.maxTokens ?? 700
  };

  if (options.responseFormat) {
    body.response_format = options.responseFormat;
  }

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': getReferer(),
      'X-OpenRouter-Title': 'The Alchemists Vision Forge'
    },
    body: JSON.stringify(body)
  }).catch(() => {
    throw new ApiError(502, 'Vision Forge AI could not be reached. Try again shortly.');
  });

  const raw = await response.text();
  let data = {};

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch (error) {
    throw new ApiError(502, 'Vision Forge AI returned an unreadable response.');
  }

  if (!response.ok) {
    const upstreamMessage = data.error && data.error.message ? String(data.error.message) : '';
    throw new ApiError(502, 'Vision Forge AI returned an error. Try again shortly.', {
      upstream_status: response.status,
      upstream_message: upstreamMessage.slice(0, 180)
    });
  }

  const choice = data.choices && data.choices[0];
  const content = choice && choice.message ? choice.message.content : '';

  if (!content || typeof content !== 'string') {
    throw new ApiError(502, 'Vision Forge AI returned an empty response. Try again.');
  }

  return content.trim();
}

module.exports = {
  callOpenRouter
};
