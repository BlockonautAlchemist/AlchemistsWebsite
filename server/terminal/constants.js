const taxonomy = require('../../src/terminal/taxonomy.json');

const TERMINAL_CHANNELS = Object.freeze(taxonomy.channels.map((channel) => channel.value));
const TERMINAL_CATEGORIES = TERMINAL_CHANNELS;
const TERMINAL_CHANNEL_LABELS = Object.freeze(Object.fromEntries(
  taxonomy.channels.map((channel) => [channel.value, channel.label])
));
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
  TERMINAL_LEGACY_CATEGORY_MIGRATION,
  TERMINAL_STRENGTHS
};
