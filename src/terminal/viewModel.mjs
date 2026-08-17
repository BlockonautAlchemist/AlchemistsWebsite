import taxonomy from './taxonomy.json' with { type: 'json' };

export const TERMINAL_CHANNELS = Object.freeze(taxonomy.channels.map((channel) => channel.value));
export const TERMINAL_CATEGORIES = TERMINAL_CHANNELS;
export const TERMINAL_SORT_OPTIONS = Object.freeze(
  taxonomy.sorts.map((sort) => Object.freeze({
    value: sort.value,
    label: sort.label
  }))
);
export const TERMINAL_SORTS = Object.freeze(TERMINAL_SORT_OPTIONS.map((sort) => sort.value));
export const TERMINAL_DEFAULT_SORT = 'latest';

const CHANNEL_SET = new Set(TERMINAL_CHANNELS);
const SORT_SET = new Set(TERMINAL_SORTS);
const CHANNEL_LABELS = Object.freeze(Object.fromEntries(
  taxonomy.channels.map((channel) => [channel.value, channel.label])
));
const TERMINAL_SEARCH_QUERY_LIMIT = 120;

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

function signalDate(value) {
  if (!value) return null;

  const source = String(value).trim();
  if (!source) return null;

  const dateOnly = source.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const date = new Date(Date.UTC(year, month - 1, day));

    return date.getUTCFullYear() === year
      && date.getUTCMonth() === month - 1
      && date.getUTCDate() === day
      ? date
      : null;
  }

  return validDate(source);
}

export function categoryLabel(category) {
  const key = String(category || '').trim();
  return CHANNEL_LABELS[key] || key.replace(/_/g, ' ').toUpperCase();
}

export function normalizeTerminalChannel(value) {
  const channel = String(value || '').trim();
  return CHANNEL_SET.has(channel) ? channel : '';
}

export function normalizeTerminalSort(value) {
  const sort = String(value || '').trim().toLowerCase();
  return SORT_SET.has(sort) ? sort : TERMINAL_DEFAULT_SORT;
}

export function normalizeTerminalSearchQuery(value) {
  if (value === undefined || value === null) return '';

  return String(value)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, TERMINAL_SEARCH_QUERY_LIMIT)
    .trim();
}

export function terminalChannelState(search) {
  const params = search instanceof URLSearchParams
    ? search
    : new URLSearchParams(String(search || '').replace(/^\?/, ''));
  const rawChannel = String(params.get('channel') || '').trim();
  const rawCategory = String(params.get('category') || '').trim();
  const channel = normalizeTerminalChannel(rawChannel);

  return {
    channel,
    rawChannel,
    hasDeprecatedCategory: Boolean(rawCategory),
    isUnknownChannel: Boolean(rawChannel && !channel)
  };
}

export function terminalFeedState(search) {
  const params = search instanceof URLSearchParams
    ? search
    : new URLSearchParams(String(search || '').replace(/^\?/, ''));
  const channelState = terminalChannelState(params);
  const rawSort = String(params.get('sort') || '').trim();
  const sort = normalizeTerminalSort(rawSort);
  const hasQ = params.has('q');
  const rawQ = String(params.get('q') || '');
  const q = normalizeTerminalSearchQuery(rawQ);
  const isUnknownSort = Boolean(rawSort && !SORT_SET.has(rawSort.toLowerCase()));
  const isNoncanonicalSort = Boolean(rawSort && rawSort !== sort);
  const isNoncanonicalQuery = hasQ && rawQ !== q;

  return {
    ...channelState,
    sort,
    rawSort,
    q,
    rawQ,
    isUnknownSort,
    isNoncanonicalSort,
    isNoncanonicalQuery
  };
}

export function terminalUrlWithState(href, { channel = '', sort = TERMINAL_DEFAULT_SORT, q = '' } = {}) {
  const url = new URL(href, 'http://localhost');
  const normalized = normalizeTerminalChannel(channel);
  const normalizedSort = normalizeTerminalSort(sort);
  const normalizedQuery = normalizeTerminalSearchQuery(q);

  url.searchParams.delete('category');
  if (normalized) url.searchParams.set('channel', normalized);
  else url.searchParams.delete('channel');
  url.searchParams.set('sort', normalizedSort);
  if (normalizedQuery) url.searchParams.set('q', normalizedQuery);
  else url.searchParams.delete('q');

  return url;
}

export function terminalUrlWithChannel(href, channel) {
  const state = terminalFeedState(new URL(href, 'http://localhost').search);
  return terminalUrlWithState(href, { channel, sort: state.sort, q: state.q });
}

export function terminalUrlWithSort(href, sort) {
  const state = terminalFeedState(new URL(href, 'http://localhost').search);
  return terminalUrlWithState(href, { channel: state.channel, sort, q: state.q });
}

export function terminalUrlWithSearch(href, q) {
  const state = terminalFeedState(new URL(href, 'http://localhost').search);
  return terminalUrlWithState(href, { channel: state.channel, sort: state.sort, q });
}

export function terminalSignalsUrl(origin, {
  channel = '',
  sort = TERMINAL_DEFAULT_SORT,
  q = '',
  limit = 50
} = {}) {
  const url = new URL('/api/terminal/signals', origin);
  const normalized = normalizeTerminalChannel(channel);
  const normalizedSort = normalizeTerminalSort(sort);
  const normalizedQuery = normalizeTerminalSearchQuery(q);

  url.searchParams.set('limit', String(limit));
  url.searchParams.set('sort', normalizedSort);
  if (normalized) url.searchParams.set('channel', normalized);
  if (normalizedQuery) url.searchParams.set('q', normalizedQuery);

  return url;
}

export function normalizeSignalsPayload(payload) {
  return payload && Array.isArray(payload.signals) ? payload.signals : [];
}

export function formatOptionalSignalDate(value) {
  const date = signalDate(value);
  return date ? DATE_FORMATTER.format(date) : '';
}

export function formatSignalDate(value) {
  return formatOptionalSignalDate(value) || 'Unknown date';
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

export function signalProvenanceParts(signal) {
  const originalDate = formatOptionalSignalDate(signal && signal.originalDate);
  const discoveredAt = formatOptionalSignalDate(signal && signal.discoveredAt);
  const parts = [];

  if (originalDate) parts.push(`Published ${originalDate}`);
  if (discoveredAt) parts.push(`Discovered ${discoveredAt}`);

  return parts;
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
