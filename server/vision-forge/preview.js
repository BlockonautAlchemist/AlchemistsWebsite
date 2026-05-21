const { ApiError } = require('./errors');
const {
  DISCORD_CLOSING_LINES,
  fittedDiscordPreview,
  formatDiscordMessage
} = require('./discord');
const { callOpenRouter } = require('./openRouter');
const { buildPreviewMessages } = require('./prompts');
const {
  hasRequiredPreviewFields,
  normalizePreview,
  sanitizeText
} = require('./validation');

const previewSchema = {
  type: 'json_schema',
  json_schema: {
    name: 'vision_forge_preview',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: [
        'title',
        'submitted_by',
        'hook',
        'vision',
        'why_it_matters',
        'how_it_could_work',
        'why_it_fits_the_alchemists',
        'first_step',
        'alignment_score',
        'relevance_status',
        'clear_connection',
        'suggested_tweaks'
      ],
      properties: {
        title: { type: 'string' },
        submitted_by: { type: 'string' },
        hook: { type: 'string' },
        vision: { type: 'string' },
        why_it_matters: { type: 'string' },
        how_it_could_work: {
          type: 'array',
          minItems: 3,
          maxItems: 3,
          items: { type: 'string' }
        },
        why_it_fits_the_alchemists: { type: 'string' },
        first_step: { type: 'string' },
        alignment_score: { type: 'integer', minimum: 1, maximum: 5 },
        relevance_status: {
          type: 'string',
          enum: ['Strong Fit', 'Needs Refinement', 'Off Track']
        },
        clear_connection: { type: 'boolean' },
        suggested_tweaks: {
          type: 'array',
          minItems: 0,
          maxItems: 3,
          items: { type: 'string' }
        }
      }
    }
  }
};

function parseJsonObject(content) {
  const cleaned = content
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');

    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch (innerError) {
        throw new ApiError(502, 'Vision Forge AI could not produce a valid Discord preview. Try again.');
      }
    }

    throw new ApiError(502, 'Vision Forge AI could not produce a valid Discord preview. Try again.');
  }
}

function evaluatePreview(preview, rawClearConnection) {
  const requiredFieldsPresent = hasRequiredPreviewFields(preview);
  const clearConnection = Boolean(rawClearConnection)
    && preview.alignment_score >= 3
    && preview.relevance_status !== 'Off Track'
    && requiredFieldsPresent;

  let postingBlockedReason = '';

  if (!requiredFieldsPresent) {
    postingBlockedReason = 'The preview is missing required Discord fields.';
  } else if (preview.alignment_score < 3) {
    postingBlockedReason = 'The idea needs a stronger Alchemists connection before it can be posted.';
  } else if (!['Strong Fit', 'Needs Refinement'].includes(preview.relevance_status)) {
    postingBlockedReason = 'The idea is currently off-track for Vision Forge.';
  } else if (!clearConnection) {
    postingBlockedReason = 'Clarify how this helps The Alchemists, its members, or its partner ecosystem.';
  }

  const canPost = !postingBlockedReason;

  return {
    ...preview,
    clear_connection: clearConnection,
    can_post: canPost,
    posting_blocked_reason: postingBlockedReason,
    suggested_tweaks: canPost
      ? []
      : preview.suggested_tweaks.length
      ? preview.suggested_tweaks
      : defaultTweaks()
  };
}

function defaultTweaks() {
  return [
    'Name the Alchemists members or partner community this would help.',
    'Add one concrete next step that the community could take together.'
  ];
}

async function generatePreview(payload) {
  const content = await callOpenRouter({
    messages: buildPreviewMessages(payload),
    responseFormat: previewSchema,
    temperature: 0.25,
    maxTokens: 1200
  });

  const rawPreview = parseJsonObject(content);
  const normalized = normalizePreview(rawPreview, payload.username);

  return evaluatePreview(normalized, rawPreview.clear_connection);
}

function clientPreview(preview) {
  const publicPreview = fittedDiscordPreview(preview);

  return {
    ...publicPreview,
    discord_post: formatDiscordMessage(preview),
    closing_lines: DISCORD_CLOSING_LINES,
    alignment_score: preview.alignment_score,
    relevance_status: preview.relevance_status,
    clear_connection: Boolean(preview.clear_connection),
    can_post: Boolean(preview.can_post),
    posting_blocked_reason: sanitizeText(preview.posting_blocked_reason, 220),
    suggested_tweaks: Array.isArray(preview.suggested_tweaks) ? preview.suggested_tweaks.slice(0, 3) : []
  };
}

module.exports = {
  clientPreview,
  evaluatePreview,
  generatePreview
};
