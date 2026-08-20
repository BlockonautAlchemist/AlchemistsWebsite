const COMMAND_CENTER_STATES = Object.freeze([
  'idle',
  'researching',
  'browsing',
  'scanning',
  'evaluating',
  'thinking',
  'writing',
  'coding',
  'processing',
  'executing',
  'publishing',
  'posting_to_x',
  'newsletter',
  'terminal_publish',
  'waiting',
  'complete',
  'warning',
  'error'
]);

const COMMAND_CENTER_ACTIVE_STATES = Object.freeze([
  'researching',
  'browsing',
  'scanning',
  'evaluating',
  'thinking',
  'writing',
  'coding',
  'processing',
  'executing',
  'publishing',
  'posting_to_x',
  'newsletter',
  'terminal_publish',
  'waiting'
]);

const DEFAULT_COMMAND_CENTER_AGENT = 'spawncamper9000';
const DEFAULT_COMMAND_CENTER_TTL_SECONDS = 900;
const COMMAND_CENTER_HISTORY_LIMIT_DEFAULT = 30;
const COMMAND_CENTER_HISTORY_LIMIT_MAX = 60;

module.exports = {
  COMMAND_CENTER_ACTIVE_STATES,
  COMMAND_CENTER_HISTORY_LIMIT_DEFAULT,
  COMMAND_CENTER_HISTORY_LIMIT_MAX,
  COMMAND_CENTER_STATES,
  DEFAULT_COMMAND_CENTER_AGENT,
  DEFAULT_COMMAND_CENTER_TTL_SECONDS
};
