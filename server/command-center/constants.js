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
const COMMAND_CENTER_RUN_HISTORY_LIMIT_DEFAULT = 8;
const COMMAND_CENTER_RUN_HISTORY_LIMIT_MAX = 24;
const COMMAND_CENTER_VISIBILITIES = Object.freeze(['public', 'diagnostic']);
const COMMAND_CENTER_WORKFLOWS = Object.freeze(
  require('../../src/command-center/workflowCatalog.json').map((entry) => Object.freeze({ ...entry }))
);
const COMMAND_CENTER_WORKFLOW_BY_SLUG = new Map(
  COMMAND_CENTER_WORKFLOWS.map((entry) => [entry.slug, entry])
);

function commandCenterWorkflow(workflow) {
  if (workflow === undefined || workflow === null) return null;
  return COMMAND_CENTER_WORKFLOW_BY_SLUG.get(String(workflow).trim().toLowerCase()) || null;
}

function labelizeWorkflow(workflow) {
  return String(workflow || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]/g, '')
    .slice(0, 80)
    .split(/[-_.]+/g)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function cleanWorkflowLabel(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/\u0000/g, '')
    .replace(/[\u0001-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 96)
    .trim();
}

function commandCenterWorkflowLabel(workflow, suppliedLabel = '') {
  return commandCenterWorkflow(workflow)?.label
    || cleanWorkflowLabel(suppliedLabel)
    || labelizeWorkflow(workflow)
    || 'Unknown';
}

module.exports = {
  COMMAND_CENTER_ACTIVE_STATES,
  COMMAND_CENTER_HISTORY_LIMIT_DEFAULT,
  COMMAND_CENTER_HISTORY_LIMIT_MAX,
  COMMAND_CENTER_RUN_HISTORY_LIMIT_DEFAULT,
  COMMAND_CENTER_RUN_HISTORY_LIMIT_MAX,
  COMMAND_CENTER_STATES,
  COMMAND_CENTER_VISIBILITIES,
  COMMAND_CENTER_WORKFLOWS,
  DEFAULT_COMMAND_CENTER_AGENT,
  DEFAULT_COMMAND_CENTER_TTL_SECONDS,
  commandCenterWorkflow,
  commandCenterWorkflowLabel,
  labelizeWorkflow
};
