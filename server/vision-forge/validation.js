const { ApiError } = require('./errors');

const LIMITS = {
  username: 80,
  idea: 2400,
  message: 1200,
  historyItem: 1200,
  previewField: 360,
  previewLongField: 620,
  title: 120,
  category: 80,
  tweak: 160
};

const REQUIRED_PREVIEW_FIELDS = [
  'title',
  'submitted_by',
  'category',
  'summary',
  'why_it_matters',
  'community_value',
  'individual_member_value',
  'suggested_next_step',
  'relevance_status'
];

function cleanWhitespace(text, preserveNewlines) {
  if (preserveNewlines) {
    return text
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((line) => line.replace(/[ \t]+/g, ' ').trim())
      .filter(Boolean)
      .join('\n');
  }

  return text.replace(/\s+/g, ' ').trim();
}

function sanitizeText(value, maxLength = 500, options = {}) {
  const preserveNewlines = Boolean(options.preserveNewlines);
  const fallback = options.fallback || '';

  if (value === null || value === undefined) return fallback;

  const text = cleanWhitespace(
    String(value)
      .replace(/\u0000/g, '')
      .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' '),
    preserveNewlines
  );

  if (!text) return fallback;

  return text.slice(0, maxLength).trim();
}

function sanitizeDiscordName(value) {
  return sanitizeText(value, LIMITS.username)
    .replace(/[@#:`*_~|>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function validateHoneypot(body) {
  const trap = sanitizeText(
    body.honeypot || body.website || body.company || body.forge_signal || '',
    120
  );

  if (trap) {
    throw new ApiError(400, 'Vision Forge could not accept this request.');
  }
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .slice(-10)
    .map((item) => {
      const role = item && item.role === 'assistant' ? 'assistant' : 'user';
      const content = sanitizeText(item && item.content, LIMITS.historyItem, {
        preserveNewlines: true
      });

      return content ? { role, content } : null;
    })
    .filter(Boolean);
}

function validateVisionPayload(body, options = {}) {
  validateHoneypot(body);

  const username = sanitizeDiscordName(body.username);
  const idea = sanitizeText(body.idea, LIMITS.idea, { preserveNewlines: true });
  const message = sanitizeText(body.message, LIMITS.message, { preserveNewlines: true });
  const history = normalizeHistory(body.history);

  if (username.length < 2) {
    throw new ApiError(400, 'Add your Discord username before using Vision Forge.');
  }

  if (idea.length < 20) {
    throw new ApiError(400, 'Share at least 20 characters so Vision Forge has enough idea context.');
  }

  if (options.messageRequired && message.length < 1) {
    throw new ApiError(400, 'Add a question or note for the idea coach.');
  }

  return {
    username,
    idea,
    message,
    history
  };
}

function clampScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(5, Math.max(1, Math.round(numeric)));
}

function normalizeStatus(value) {
  const status = sanitizeText(value, 40);

  if (/strong/i.test(status)) return 'Strong Fit';
  if (/refine|needs/i.test(status)) return 'Needs Refinement';
  return 'Off Track';
}

function normalizeTweaks(value) {
  const source = Array.isArray(value) ? value : [];

  return source
    .map((item) => sanitizeText(item, LIMITS.tweak))
    .filter(Boolean)
    .slice(0, 3);
}

function normalizePreview(raw, username) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const preview = {
    title: sanitizeText(source.title, LIMITS.title, { fallback: 'Untitled Vision Forge Idea' }),
    submitted_by: sanitizeDiscordName(source.submitted_by) || username,
    category: sanitizeText(source.category, LIMITS.category, { fallback: 'Community Idea' }),
    summary: sanitizeText(source.summary, LIMITS.previewLongField),
    why_it_matters: sanitizeText(source.why_it_matters, LIMITS.previewLongField),
    community_value: sanitizeText(source.community_value, LIMITS.previewLongField),
    individual_member_value: sanitizeText(source.individual_member_value, LIMITS.previewLongField),
    suggested_next_step: sanitizeText(source.suggested_next_step, LIMITS.previewLongField),
    alignment_score: clampScore(source.alignment_score),
    relevance_status: normalizeStatus(source.relevance_status),
    suggested_tweaks: normalizeTweaks(source.suggested_tweaks)
  };

  return preview;
}

function hasRequiredPreviewFields(preview) {
  return REQUIRED_PREVIEW_FIELDS.every((field) => Boolean(sanitizeText(preview[field], LIMITS.previewField)));
}

module.exports = {
  LIMITS,
  REQUIRED_PREVIEW_FIELDS,
  hasRequiredPreviewFields,
  normalizePreview,
  sanitizeText,
  validateVisionPayload
};
