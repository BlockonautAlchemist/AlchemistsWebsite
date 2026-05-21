const { ApiError } = require('../shared/errors');
const { sanitizeDiscordName, sanitizeText, sanitizeUrl } = require('../shared/validation');
const { reactionThreshold } = require('./threshold');

const MAX_DISCORD_MESSAGE_LENGTH = 1900;

function displayUsername(value) {
  return `@${sanitizeDiscordName(value) || 'unknown'}`;
}

function publicUrlForSignal(signal) {
  const base = process.env.SITE_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');

  return base ? `${base.replace(/\/$/, '')}/games/${signal.slug}` : `/games/${signal.slug}`;
}

function humanizeSignalType(value) {
  const label = sanitizeText(value, 80).replace(/-/g, ' ');
  return label ? label.replace(/\b\w/g, (char) => char.toUpperCase()) : 'Other Game Signal';
}

function thresholdForSignal(signal) {
  const value = Number(signal && signal.threshold);
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : reactionThreshold();
}

function normalizeWatchItems(value, fallback) {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/\n+/)
      : [];

  const items = source
    .map((item) => sanitizeText(String(item).replace(/^[-*•]\s*/, ''), 110, {
      truncateAt: 'natural'
    }))
    .filter(Boolean)
    .slice(0, 3);

  return items.length ? items : fallback;
}

function previewFields(signal, caps) {
  const refined = signal.refined || {};
  const fallbackWatchItems = normalizeWatchItems(signal.what_to_watch, [
    'Review the core game loop and first-session feel.',
    'Check timing, access, and community momentum.',
    'Look for creator, competitive, or collaboration upside.'
  ]);

  return {
    title: sanitizeText(signal.game_title || signal.title || refined.title, caps.title, {
      truncateAt: 'natural',
      terminalPunctuation: false
    }),
    short_summary: sanitizeText(refined.short_summary || signal.summary, caps.short_summary, {
      truncateAt: 'natural'
    }),
    why_it_matters: sanitizeText(refined.why_it_matters || refined.short_summary || signal.summary, caps.why_it_matters, {
      truncateAt: 'natural'
    }),
    what_to_watch: normalizeWatchItems(refined.what_to_watch, fallbackWatchItems)
      .map((item) => sanitizeText(String(item).replace(/^[-*•]\s*/, ''), caps.bullet, {
        truncateAt: 'natural'
      }))
      .filter(Boolean)
      .slice(0, 3),
    game_url: sanitizeUrl(signal.game_url) || 'No game link provided.'
  };
}

function buildMessage(signal, fields) {
  const threshold = thresholdForSignal(signal);
  const lines = [
    `New Game Signal: ${fields.title}`,
    '',
    `**Signal Type**\n${humanizeSignalType(signal.signal_type)}`,
    '',
    `**Submitted By**\n${displayUsername(signal.submitted_by)}`,
    '',
    `**Why Alchemists Should Watch**\n${fields.why_it_matters || fields.short_summary}`,
    '',
    `**What To Watch**\n${fields.what_to_watch.map((item) => `- ${item}`).join('\n')}`,
    '',
    `**Game Link**\n${fields.game_url}`,
    '',
    '**Community Vote**\nReact if The Alchemists should move this game toward a published watch page.',
    '',
    `**Threshold**\n${threshold} reactions needed for community approval.`
  ];

  return lines
    .filter((line) => line !== '')
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatDiscordSignalMessage(signal) {
  const caps = {
    title: 110,
    short_summary: 220,
    why_it_matters: 260,
    bullet: 110
  };
  const minimums = {
    short_summary: 110,
    why_it_matters: 120,
    bullet: 65
  };
  let fields = previewFields(signal, caps);
  let message = buildMessage(signal, fields);
  let guard = 0;

  while (message.length > MAX_DISCORD_MESSAGE_LENGTH && guard < 20) {
    const overage = message.length - MAX_DISCORD_MESSAGE_LENGTH;
    const reduction = Math.max(8, Math.ceil(overage / Object.keys(minimums).length));
    let changed = false;

    Object.entries(minimums).forEach(([field, min]) => {
      if (caps[field] > min) {
        caps[field] = Math.max(min, caps[field] - reduction);
        changed = true;
      }
    });

    if (!changed) break;
    fields = previewFields(signal, caps);
    message = buildMessage(signal, fields);
    guard += 1;
  }

  return message.length <= MAX_DISCORD_MESSAGE_LENGTH
    ? message
    : `${message.slice(0, MAX_DISCORD_MESSAGE_LENGTH - 1).trim()}.`;
}

async function postSignalToDiscord(signal) {
  const webhookUrl = process.env.GAME_SIGNAL_DISCORD_WEBHOOK_URL;

  if (!webhookUrl) {
    return {
      posted: false,
      skipped: true
    };
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      username: 'Game Signal Engine',
      content: formatDiscordSignalMessage(signal),
      allowed_mentions: {
        parse: []
      }
    })
  }).catch(() => {
    throw new ApiError(502, 'Game Signal Engine could not reach Discord. The signal was saved.');
  });

  if (!response.ok) {
    throw new ApiError(502, 'Discord rejected the Game Signal Engine post. The signal was saved.', {
      discord_status: response.status
    });
  }

  return {
    posted: true,
    skipped: false
  };
}

module.exports = {
  MAX_DISCORD_MESSAGE_LENGTH,
  formatDiscordSignalMessage,
  postSignalToDiscord,
  publicUrlForSignal
};
