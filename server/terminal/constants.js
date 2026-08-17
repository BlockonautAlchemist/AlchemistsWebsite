const taxonomy = require('../../src/terminal/taxonomy.json');

const TERMINAL_CHANNELS = Object.freeze(taxonomy.channels.map((channel) => channel.value));
const TERMINAL_CATEGORIES = TERMINAL_CHANNELS;
const TERMINAL_CHANNEL_LABELS = Object.freeze(Object.fromEntries(
  taxonomy.channels.map((channel) => [channel.value, channel.label])
));
const TERMINAL_SORT_OPTIONS = Object.freeze(
  taxonomy.sorts.map((sort) => Object.freeze({
    value: sort.value,
    label: sort.label
  }))
);
const TERMINAL_SORTS = Object.freeze(TERMINAL_SORT_OPTIONS.map((sort) => sort.value));
const TERMINAL_DEFAULT_SORT = 'latest';
const TERMINAL_LEGACY_CATEGORY_MIGRATION = Object.freeze({
  ...taxonomy.legacyCategoryMigration
});

const TERMINAL_STRENGTHS = Object.freeze([
  'Player',
  'Creator',
  'Builder',
  'Connector',
  'Researcher',
  'Strategist',
  'Supporter'
]);

module.exports = {
  TERMINAL_CATEGORIES,
  TERMINAL_CHANNEL_LABELS,
  TERMINAL_CHANNELS,
  TERMINAL_DEFAULT_SORT,
  TERMINAL_LEGACY_CATEGORY_MIGRATION,
  TERMINAL_SORT_OPTIONS,
  TERMINAL_SORTS,
  TERMINAL_STRENGTHS
};
