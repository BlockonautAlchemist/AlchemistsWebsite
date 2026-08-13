export const TERMINAL_CATEGORIES = Object.freeze([
  'AI_TOOL',
  'GAME_DEV',
  'CREATOR_TOOL',
  'MONEY',
  'PLATFORM',
  'OPPORTUNITY',
  'RESEARCH',
  'EXPERIMENT',
  'NEWS'
]);

const CATEGORY_LABELS = Object.freeze({
  AI_TOOL: 'AI Tool',
  GAME_DEV: 'Game Dev',
  CREATOR_TOOL: 'Creator Tool',
  MONEY: 'Money',
  PLATFORM: 'Platform',
  OPPORTUNITY: 'Opportunity',
  RESEARCH: 'Research',
  EXPERIMENT: 'Experiment',
  NEWS: 'News'
});

const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC'
});

function validDate(value) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp);
}

export function categoryLabel(category) {
  const key = String(category || '').trim();
  return CATEGORY_LABELS[key] || key.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

export function normalizeSignalsPayload(payload) {
  return payload && Array.isArray(payload.signals) ? payload.signals : [];
}

export function formatSignalDate(value) {
  if (!value) return 'Unknown date';

  const source = String(value);
  const dateOnly = source.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = dateOnly
    ? new Date(Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])))
    : validDate(source);

  return date ? DATE_FORMATTER.format(date) : 'Unknown date';
}

export function relativeSignalTime(value, now = Date.now()) {
  const date = validDate(value);
  if (!date) return 'Recently';

  const seconds = Math.max(0, Math.round((Number(now) - date.getTime()) / 1000));
  const units = [
    ['d', 86400],
    ['h', 3600],
    ['m', 60]
  ];

  for (const [label, size] of units) {
    const count = Math.floor(seconds / size);
    if (count >= 1) return `${count}${label} ago`;
  }

  return 'Just now';
}

export function compactSignalTags(signal, limit = 4) {
  const max = Math.max(0, Number(limit) || 0);
  const tags = [];
  const seen = new Set();
  const source = signal && Array.isArray(signal.tags) ? signal.tags : [];

  source.forEach((value) => {
    const tag = String(value || '').trim();
    const key = tag.toLowerCase();
    if (!tag || seen.has(key) || tags.length >= max) return;
    seen.add(key);
    tags.push(tag);
  });

  return tags;
}

export function strengthSummary(signal, limit = 3) {
  const strengths = signal && Array.isArray(signal.relevantStrengths) ? signal.relevantStrengths : [];
  const shown = strengths.slice(0, limit);
  const hidden = strengths.length - shown.length;

  return hidden > 0 ? `${shown.join(', ')} +${hidden}` : shown.join(', ');
}
