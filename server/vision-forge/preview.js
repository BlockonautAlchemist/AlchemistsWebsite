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

const FIELD_ALIASES = {
  title: ['title', 'ideaTitle', 'postTitle', 'projectTitle', 'name', 'ideaName'],
  submitted_by: ['submitted_by', 'submittedBy', 'submitted by', 'submitter', 'author', 'username', 'discordUsername', 'discord_username'],
  hook: ['hook', 'headline', 'tagline', 'intro', 'opening', 'oneLineSummary', 'one_line_summary'],
  vision: ['vision', 'theVision', 'the vision', 'description', 'idea', 'concept', 'proposal', 'summary', 'overview'],
  why_it_matters: ['why_it_matters', 'whyItMatters', 'why it matters', 'impact', 'communityValue', 'community_value', 'value', 'importance'],
  how_it_could_work: ['how_it_could_work', 'howItCouldWork', 'how it could work', 'how', 'plan', 'steps', 'implementation', 'actionPlan', 'action_plan', 'approach'],
  why_it_fits_the_alchemists: ['why_it_fits_the_alchemists', 'whyItFitsTheAlchemists', 'why it fits the alchemists', 'alchemistsFit', 'alchemists_fit', 'communityFit', 'community_fit', 'fit'],
  first_step: ['first_step', 'firstStep', 'first step', 'nextStep', 'next_step', 'suggestedNextStep', 'suggested_next_step', 'cta', 'callToAction', 'call_to_action'],
  alignment_score: ['alignment_score', 'alignmentScore', 'alignment score', 'score', 'rating', 'scoreOutOf5', 'score_out_of_5'],
  relevance_status: ['relevance_status', 'relevanceStatus', 'relevance status', 'status', 'fitStatus', 'fit_status'],
  clear_connection: ['clear_connection', 'clearConnection', 'clear connection', 'clearAlchemistsConnection', 'clear_alchemists_connection', 'isRelevant', 'is_relevant', 'relevant', 'aligned'],
  suggested_tweaks: ['suggested_tweaks', 'suggestedTweaks', 'suggested tweaks', 'tweaks', 'suggestions', 'improvements']
};

const ALIAS_TO_FIELD = Object.entries(FIELD_ALIASES).reduce((aliases, [field, names]) => {
  names.forEach((name) => {
    aliases[canonicalKey(name)] = field;
  });
  return aliases;
}, {});

const FALLBACK_BULLETS = [
  'Clarify the members, creators, game, or partner community this would help.',
  'Define one small pilot, thread, or session where the community can respond.',
  'Collect volunteer interest, useful skills, and concrete next-step suggestions.'
];

function canonicalKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stripMarkdownCodeFences(content) {
  return String(content || '')
    .replace(/\u0000/g, '')
    .trim()
    .replace(/^```(?:json|javascript|js)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function tryParseObject(value) {
  try {
    const parsed = JSON.parse(value);
    return isPlainObject(parsed) ? parsed : null;
  } catch (error) {
    return null;
  }
}

function extractEmbeddedJsonObject(content) {
  const text = String(content || '');
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }

    if (char === '}' && depth > 0) {
      depth -= 1;

      if (depth === 0 && start >= 0) {
        const parsed = tryParseObject(text.slice(start, index + 1));
        if (parsed) return parsed;
        start = -1;
      }
    }
  }

  return null;
}

function canonicalizePreviewKeys(rawPreview) {
  if (!isPlainObject(rawPreview)) return {};

  return Object.entries(rawPreview).reduce((preview, [key, value]) => {
    const mapped = ALIAS_TO_FIELD[canonicalKey(key)] || key;

    if (preview[mapped] === undefined || preview[mapped] === null || preview[mapped] === '') {
      preview[mapped] = value;
    }

    return preview;
  }, {});
}

function looksLikeRefusal(content) {
  return /\b(?:i\s+(?:can(?:not|'t)|won't|am unable)|sorry,\s+i|unable to comply|cannot assist)\b/i.test(content || '');
}

function parsePreviewContent(content) {
  const cleaned = stripMarkdownCodeFences(content);

  if (!cleaned) {
    return {
      rawPreview: null,
      sourceText: '',
      parseNotes: [],
      fallbackReasons: ['empty_model_response']
    };
  }

  const direct = tryParseObject(cleaned);

  if (direct) {
    return {
      rawPreview: canonicalizePreviewKeys(direct),
      sourceText: '',
      parseNotes: ['direct_json'],
      fallbackReasons: []
    };
  }

  const embedded = extractEmbeddedJsonObject(cleaned);

  if (embedded) {
    return {
      rawPreview: canonicalizePreviewKeys(embedded),
      sourceText: '',
      parseNotes: ['embedded_json'],
      fallbackReasons: []
    };
  }

  return {
    rawPreview: null,
    sourceText: looksLikeRefusal(cleaned) ? '' : cleaned,
    parseNotes: [],
    fallbackReasons: [looksLikeRefusal(cleaned) ? 'model_refusal' : 'malformed_model_content']
  };
}

function coerceBoolean(value) {
  if (value === true || value === false) return value;
  if (typeof value === 'number') return value > 0;

  const normalized = sanitizeText(value, 40).toLowerCase();
  if (/^(true|yes|y|clear|aligned|relevant|strong)$/i.test(normalized)) return true;
  if (/^(false|no|n|unclear|not clear|not aligned|irrelevant|off track)$/i.test(normalized)) return false;
  return false;
}

function hasText(value) {
  return Boolean(sanitizeText(value, 20));
}

function hasProvidedValue(source, field) {
  if (!source || source[field] === undefined || source[field] === null) return false;

  if (field === 'how_it_could_work') {
    if (Array.isArray(source[field])) {
      return source[field].some((item) => hasText(item));
    }
    return hasText(source[field]);
  }

  if (typeof source[field] === 'boolean' || typeof source[field] === 'number') return true;
  return hasText(source[field]);
}

function latestUserMessage(payload) {
  const messages = Array.isArray(payload && payload.messages) ? payload.messages : [];

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user' && hasText(messages[index].content)) {
      return messages[index].content;
    }
  }

  return '';
}

function firstUsefulLine(text) {
  return String(text || '')
    .split('\n')
    .map((line) => sanitizeText(line.replace(/^[-*#>\s]+/, ''), 180))
    .find(Boolean) || '';
}

function titleFromText(text) {
  const line = firstUsefulLine(text)
    .replace(/^(?:idea|title|vision|summary|concept|proposal)\s*[:\-]\s*/i, '')
    .replace(/^["']|["']$/g, '');
  const sentence = line.split(/[.!?]/).find(Boolean) || line;
  const title = sanitizeText(sentence, 80);

  if (!title || title.length < 4) return 'Vision Forge Idea';
  return title;
}

function compactIdea(text) {
  return sanitizeText(firstUsefulLine(text) || text, 220) || 'a member-submitted idea for The Alchemists community';
}

function buildFallbackPreview(payload, sourceText = '') {
  const userText = latestUserMessage(payload);
  const seedText = sourceText || userText;
  const ideaText = compactIdea(seedText);
  const title = titleFromText(seedText);

  return {
    title,
    submitted_by: payload.username,
    hook: `A member-submitted idea for The Alchemists community: ${ideaText}`,
    vision: `This preview needs refinement, but the core idea is to shape ${ideaText} into a community-facing proposal that members can understand, discuss, and improve together.`,
    why_it_matters: 'The idea could matter if it creates a clear benefit for members, creators, players, partner games, or community projects. The next draft should name who it helps and what useful outcome it creates.',
    how_it_could_work: FALLBACK_BULLETS,
    why_it_fits_the_alchemists: 'It could fit The Alchemists if it connects to gaming, creation, collaboration, feedback, skill sharing, opportunity discovery, or doing good through the community.',
    first_step: 'Rewrite the idea with the target audience, the community benefit, and one concrete action The Alchemists can take next.',
    alignment_score: 2,
    relevance_status: 'Needs Refinement',
    clear_connection: false,
    suggested_tweaks: defaultTweaks()
  };
}

function completePreview(rawPreview, payload, sourceText = '') {
  const source = canonicalizePreviewKeys(rawPreview);
  const normalized = normalizePreview(source, payload.username);
  const fallback = buildFallbackPreview(payload, sourceText);
  const preview = {
    ...normalized
  };
  const synthesizedFields = [];

  [
    'title',
    'hook',
    'vision',
    'why_it_matters',
    'why_it_fits_the_alchemists',
    'first_step'
  ].forEach((field) => {
    if (!hasText(preview[field])) {
      preview[field] = fallback[field];
      synthesizedFields.push(field);
    }
  });

  if (!hasText(preview.submitted_by)) {
    preview.submitted_by = fallback.submitted_by;
  }

  if (!Array.isArray(preview.how_it_could_work)) {
    preview.how_it_could_work = [];
  }

  if (preview.how_it_could_work.length < 3) {
    const existing = preview.how_it_could_work.filter(hasText);

    preview.how_it_could_work = [
      ...existing,
      ...fallback.how_it_could_work.filter((item) => !existing.includes(item))
    ].slice(0, 3);
    synthesizedFields.push('how_it_could_work');
  }

  if (!hasProvidedValue(source, 'relevance_status')) {
    preview.relevance_status = fallback.relevance_status;
    synthesizedFields.push('relevance_status');
  }

  if (!hasProvidedValue(source, 'alignment_score')) {
    preview.alignment_score = fallback.alignment_score;
  }

  if (!preview.suggested_tweaks.length) {
    preview.suggested_tweaks = fallback.suggested_tweaks;
  }

  if (synthesizedFields.length && preview.relevance_status !== 'Off Track') {
    preview.relevance_status = fallback.relevance_status;
  }

  preview.required_fields_synthesized = synthesizedFields.length > 0;
  preview.synthesized_fields = synthesizedFields;

  return {
    preview,
    rawClearConnection: coerceBoolean(source.clear_connection),
    synthesizedFields
  };
}

function emitDiagnostic(options, event, details = {}) {
  if (typeof options.onDiagnostic !== 'function') return;

  try {
    options.onDiagnostic(event, details);
  } catch (error) {
    // Logging hooks are best-effort only.
  }
}

function evaluatePreview(preview, rawClearConnection, options = {}) {
  const requiredFieldsPresent = hasRequiredPreviewFields(preview);
  const requiredFieldsSynthesized = Boolean(
    options.requiredFieldsSynthesized || preview.required_fields_synthesized
  );
  const clearConnection = coerceBoolean(rawClearConnection)
    && preview.alignment_score >= 3
    && preview.relevance_status !== 'Off Track'
    && requiredFieldsPresent
    && !requiredFieldsSynthesized;

  let postingBlockedReason = '';

  if (!requiredFieldsPresent) {
    postingBlockedReason = 'The preview is missing required Discord fields.';
  } else if (requiredFieldsSynthesized) {
    postingBlockedReason = 'Vision Forge generated a safe fallback preview. Refine the idea and regenerate before posting.';
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

async function generatePreview(payload, options = {}) {
  return generatePreviewWithOptions(payload, options);
}

async function generatePreviewWithOptions(payload, options = {}) {
  const content = await callOpenRouter({
    messages: buildPreviewMessages(payload),
    allowEmptyContent: true,
    onDiagnostic: options.onDiagnostic,
    temperature: 0.25,
    maxTokens: 1200
  });

  const parsed = parsePreviewContent(content);
  const completed = completePreview(parsed.rawPreview, payload, parsed.sourceText);
  const fallbackReasons = [
    ...parsed.fallbackReasons,
    ...(completed.synthesizedFields.length ? ['synthesized_required_fields'] : [])
  ];

  emitDiagnostic(options, 'preview_parse', {
    parsed_json: Boolean(parsed.rawPreview),
    parse_notes: parsed.parseNotes,
    fallback_reasons: fallbackReasons,
    synthesized_fields: completed.synthesizedFields
  });

  const evaluated = evaluatePreview(
    {
      ...completed.preview,
      preview_fallback_reasons: fallbackReasons
    },
    completed.rawClearConnection,
    {
      requiredFieldsSynthesized: completed.synthesizedFields.length > 0
    }
  );

  return {
    ...evaluated,
    preview_fallback_reasons: fallbackReasons,
    parse_notes: parsed.parseNotes
  };
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
  buildFallbackPreview,
  clientPreview,
  completePreview,
  evaluatePreview,
  generatePreview,
  generatePreviewWithOptions,
  parsePreviewContent
};
