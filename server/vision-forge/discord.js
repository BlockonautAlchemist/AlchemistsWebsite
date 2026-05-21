const { ApiError } = require('./errors');
const { sanitizeDiscordName, sanitizeText } = require('./validation');

const DISCORD_CLOSING_LINES = [
  'React to vote if you want to see this move forward.',
  'Reply with feedback, ideas, or skills you can offer.'
];

const MAX_DISCORD_MESSAGE_LENGTH = 1900;
const DEFAULT_FIELD_CAPS = {
  title: 120,
  hook: 220,
  vision: 320,
  why_it_matters: 280,
  bullet: 120,
  why_it_fits_the_alchemists: 280,
  first_step: 180
};
const MIN_FIELD_CAPS = {
  hook: 100,
  vision: 150,
  why_it_matters: 130,
  bullet: 70,
  why_it_fits_the_alchemists: 130,
  first_step: 100
};
const ABSOLUTE_MIN_FIELD_CAPS = {
  title: 80,
  hook: 80,
  vision: 100,
  why_it_matters: 100,
  bullet: 55,
  why_it_fits_the_alchemists: 100,
  first_step: 80
};

function displayUsername(value) {
  return `@${sanitizeDiscordName(value) || 'unknown'}`;
}

function sanitizeBullets(value, maxLength) {
  return (Array.isArray(value) ? value : [])
    .map((item) => sanitizeText(String(item).replace(/^[-*•]\s*/, ''), maxLength, {
      truncateAt: 'natural'
    }))
    .filter(Boolean)
    .slice(0, 3);
}

function publicDiscordPreview(preview, caps = DEFAULT_FIELD_CAPS) {
  return {
    title: sanitizeText(preview.title, caps.title, {
      truncateAt: 'natural',
      terminalPunctuation: false
    }),
    submitted_by: sanitizeDiscordName(preview.submitted_by),
    hook: sanitizeText(preview.hook, caps.hook, { truncateAt: 'natural' }),
    vision: sanitizeText(preview.vision, caps.vision, { truncateAt: 'natural' }),
    why_it_matters: sanitizeText(preview.why_it_matters, caps.why_it_matters, {
      truncateAt: 'natural'
    }),
    how_it_could_work: sanitizeBullets(preview.how_it_could_work, caps.bullet),
    why_it_fits_the_alchemists: sanitizeText(
      preview.why_it_fits_the_alchemists,
      caps.why_it_fits_the_alchemists,
      { truncateAt: 'natural' }
    ),
    first_step: sanitizeText(preview.first_step, caps.first_step, { truncateAt: 'natural' })
  };
}

function buildDiscordMessage(publicPreview) {
  const lines = [
    '# VISION-FORGE',
    `Idea from: ${displayUsername(publicPreview.submitted_by)}`,
    '',
    `**${publicPreview.title}**`,
    '',
    publicPreview.hook,
    '',
    `**The Vision**\n${publicPreview.vision}`,
    '',
    `**Why It Matters**\n${publicPreview.why_it_matters}`,
    '',
    `**How It Could Work**\n${publicPreview.how_it_could_work.map((item) => `- ${item}`).join('\n')}`,
    '',
    `**Why It Fits The Alchemists**\n${publicPreview.why_it_fits_the_alchemists}`,
    '',
    `**First Step**\n${publicPreview.first_step}`,
    '',
    ...DISCORD_CLOSING_LINES
  ];

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function fittedDiscordPreview(preview) {
  const caps = { ...DEFAULT_FIELD_CAPS };
  let publicPreview = publicDiscordPreview(preview, caps);
  let message = buildDiscordMessage(publicPreview);
  let guard = 0;

  while (message.length > MAX_DISCORD_MESSAGE_LENGTH && guard < 20) {
    const overage = message.length - MAX_DISCORD_MESSAGE_LENGTH;
    const reduction = Math.max(10, Math.ceil(overage / Object.keys(MIN_FIELD_CAPS).length));
    const changed = reduceCaps(caps, MIN_FIELD_CAPS, reduction);

    if (!changed) break;

    publicPreview = publicDiscordPreview(preview, caps);
    message = buildDiscordMessage(publicPreview);
    guard += 1;
  }

  guard = 0;

  while (message.length > MAX_DISCORD_MESSAGE_LENGTH && guard < 20) {
    const overage = message.length - MAX_DISCORD_MESSAGE_LENGTH;
    const reduction = Math.max(8, Math.ceil(overage / Object.keys(ABSOLUTE_MIN_FIELD_CAPS).length));
    const changed = reduceCaps(caps, ABSOLUTE_MIN_FIELD_CAPS, reduction);

    if (!changed) break;

    publicPreview = publicDiscordPreview(preview, caps);
    message = buildDiscordMessage(publicPreview);
    guard += 1;
  }

  return publicPreview;
}

function reduceCaps(caps, minimums, reduction) {
  let changed = false;

  Object.entries(minimums).forEach(([field, min]) => {
    if (caps[field] > min) {
      caps[field] = Math.max(min, caps[field] - reduction);
      changed = true;
    }
  });

  return changed;
}

function formatDiscordMessage(preview) {
  return buildDiscordMessage(fittedDiscordPreview(preview));
}

async function postToDiscord(preview) {
  const webhookUrl = process.env.DISCORD_VISION_FORGE_WEBHOOK_URL;

  if (!webhookUrl) {
    throw new ApiError(503, 'Discord posting is not configured yet. Add DISCORD_VISION_FORGE_WEBHOOK_URL in Vercel Environment Variables.');
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      username: 'Vision Forge',
      content: formatDiscordMessage(preview),
      allowed_mentions: {
        parse: []
      }
    })
  }).catch(() => {
    throw new ApiError(502, 'Vision Forge could not reach the Discord webhook. Try again shortly.');
  });

  if (!response.ok) {
    throw new ApiError(502, 'Discord rejected the Vision Forge post. Check the webhook URL and channel permissions.', {
      discord_status: response.status
    });
  }
}

module.exports = {
  DISCORD_CLOSING_LINES,
  fittedDiscordPreview,
  formatDiscordMessage,
  MAX_DISCORD_MESSAGE_LENGTH,
  postToDiscord
};
