// Semantic machine metadata for SpawnCamper9000 workflow mapping.
//
// This module deliberately contains no room geometry, draw bounds, asset paths,
// texture keys, frame data, or production-art metadata. sceneConfig.mjs remains
// the source of truth for physical placement and the whitebox fallback.

import workflowCatalog from './workflowCatalog.json' with { type: 'json' };

export const COMMAND_CENTER_WORKFLOWS = Object.freeze(
  workflowCatalog.map((entry) => Object.freeze({ ...entry }))
);

const WORKFLOW_BY_SLUG = new Map(COMMAND_CENTER_WORKFLOWS.map((entry) => [entry.slug, entry]));
const workflowsForMachine = (machineId) => COMMAND_CENTER_WORKFLOWS
  .filter((entry) => entry.machineId === machineId)
  .map((entry) => entry.slug);

const machine = ({
  id,
  name,
  shortName,
  description,
  input,
  work,
  output,
  visualDescription,
  workflows = [],
  areaId,
  propKeys = []
}) => Object.freeze({
  id,
  name,
  shortName,
  description,
  purpose: description,
  input,
  work,
  output,
  visualDescription,
  workflows: Object.freeze(workflows),
  areaId,
  propKeys: Object.freeze(propKeys)
});

export const COMMAND_CENTER_MACHINES = Object.freeze([
  machine({
    id: 'news-array',
    name: 'News Array',
    shortName: 'News',
    description: 'Researches recent AI releases and platform changes, ranking what gaming builders can act on.',
    input: 'Public AI and gaming sources',
    work: 'Research and monitor news',
    output: 'Source-backed findings',
    visualDescription: 'Wall feed shells with cycling CRT cells and cyan packet activity.',
    workflows: workflowsForMachine('news-array'),
    areaId: 'intelligence-research',
    propKeys: ['prop_wall_feed_shells']
  }),
  machine({
    id: 'repo-forge',
    name: 'Repo Forge',
    shortName: 'Repos',
    description: 'Finds fast-rising open-source repos worth cloning, with maturity ratings and test guidance.',
    input: 'Repository and code signals',
    work: 'Watch useful engineering changes',
    output: 'Repository findings',
    visualDescription: 'Green code bench with a disk tower and phosphor terminal scroll.',
    workflows: workflowsForMachine('repo-forge'),
    areaId: 'github-code',
    propKeys: ['prop_code_bench', 'prop_disk_tower']
  }),
  machine({
    id: 'tool-scanner',
    name: 'Tool Scanner',
    shortName: 'Tools',
    description: 'Finds newly launched AI tools for gaming creators, including pricing and practical usability.',
    input: 'Newly discovered AI and game-dev tools',
    work: 'Assess relevance',
    output: 'Tool opportunity notes',
    visualDescription: 'Long scanner bench with a moving cyan scan bar and ready lamp.',
    workflows: workflowsForMachine('tool-scanner'),
    areaId: 'scanner-bench',
    propKeys: ['prop_scanner_bench']
  }),
  machine({
    id: 'agent-lab',
    name: 'Agent Lab',
    shortName: 'Agents',
    description: 'Tracks bots, NPC agents, and creator automations, including what they enable and build difficulty.',
    input: 'Agent and automation signals',
    work: 'Review workflow patterns',
    output: 'Agent-workflow findings',
    visualDescription: 'Wall-mounted lab cabinet with a lit central incubation chamber.',
    workflows: workflowsForMachine('agent-lab'),
    areaId: 'agent-lab',
    propKeys: ['prop_wall_agent_lab']
  }),
  machine({
    id: 'model-furnace',
    name: 'Model Furnace',
    shortName: 'Models',
    description: 'Tracks model costs, latency, and gaming platform API changes that affect what builders can run.',
    input: 'Model and infrastructure options',
    work: 'Compare routing and infrastructure',
    output: 'Evaluations',
    visualDescription: 'Twin racks feeding an industrial chamber with heat and fan motion.',
    workflows: workflowsForMachine('model-furnace'),
    areaId: 'model-infrastructure',
    propKeys: ['prop_furnace_chamber', 'prop_rack_a', 'prop_rack_b']
  }),
  machine({
    id: 'creator-console',
    name: 'Creator Console',
    shortName: 'Creator',
    description: 'Researches AI production tools and platform payout changes for streamers, clippers, and VTubers.',
    input: 'Vetted findings',
    work: 'Shape creator-facing angles',
    output: 'Private draft material and content angles',
    visualDescription: 'Floor console with a three-cell editorial CRT row and signal traffic.',
    workflows: workflowsForMachine('creator-console'),
    areaId: 'creator-console',
    propKeys: ['prop_creator_console']
  }),
  machine({
    id: 'profit-analyzer',
    name: 'Profit Analyzer',
    shortName: 'Profit',
    description: 'Finds documented AI-in-gaming revenue cases and keeps only those backed by real numbers.',
    input: 'Market and partner signals',
    work: 'Assess opportunity',
    output: 'Monetization assessments',
    visualDescription: 'Floor console with a gold analysis CRT row and warmer pulses.',
    workflows: workflowsForMachine('profit-analyzer'),
    areaId: 'profit-analyzer',
    propKeys: ['prop_profit_analyzer']
  }),
  // Zone 09, the middle of the room. It shared the scanner bench with Tool Scanner
  // and Agent Lab until the Power Core — scenery with no workflow behind it — was
  // retired and this machine took its floor pocket. Workflow key and
  // every other semantic field are untouched; only where it physically stands moved.
  machine({
    id: 'experiment-bench',
    name: 'Experiment Bench',
    shortName: 'Playbooks',
    description: 'Synthesizes research into concrete build ideas with the smallest practical version to test.',
    input: 'Findings and ideas',
    work: 'Form repeatable experiments',
    output: 'Playbook and experiment drafts',
    visualDescription: 'Wooden alchemist bench with potions, books, a glowing magical circle and spell effects.',
    workflows: workflowsForMachine('experiment-bench'),
    areaId: 'experiment-bench',
    propKeys: ['prop_experiment_bench']
  }),
  machine({
    id: 'newsletter-still',
    name: 'Newsletter Still',
    shortName: 'Letter',
    description: 'Writes and verifies the daily newsletter from prior research, then saves it for publishing.',
    input: 'Vetted issue material',
    work: 'Distill longer-form updates',
    output: 'Newsletter draft or finalization result',
    visualDescription: 'Tall distillation column with chamber fill, coil, and output tray.',
    workflows: workflowsForMachine('newsletter-still'),
    areaId: 'newsletter',
    propKeys: ['prop_still_column', 'prop_still_tray']
  }),
  machine({
    id: 'x-uplink',
    name: 'X Uplink',
    shortName: 'X',
    description: 'Selects fresh findings, fact-checks and publishes X posts, plus a daily joke post.',
    input: 'Vetted content signals',
    work: 'Format and transmit X content',
    output: 'Public post only when linked',
    visualDescription: 'Communications console with CRT transport glyphs and antenna mast.',
    workflows: workflowsForMachine('x-uplink'),
    areaId: 'x-communications',
    propKeys: ['prop_x_console', 'prop_x_mast']
  }),
  machine({
    id: 'publish-transmitter',
    name: 'Publish Transmitter',
    shortName: 'Publish',
    description: 'Publishes vetted findings to the Terminal and prepares newsletter content for manual Beehiiv publishing.',
    input: 'Vetted signals and drafts',
    work: 'Hand off to Terminal or Beehiiv',
    output: 'Signal or draft result; not automatically published',
    visualDescription: 'Heavy transmitter cabinet with a large CRT and charge meter.',
    workflows: workflowsForMachine('publish-transmitter'),
    areaId: 'terminal-transmitter',
    propKeys: ['prop_tx_body']
  }),
  machine({
    id: 'opportunity-radar',
    name: 'Opportunity Radar',
    shortName: 'Radar',
    description: 'Scans rotating sources for promising leads and feeds verified opportunities into the research stations.',
    input: 'Opportunity Scout telemetry, when emitted',
    work: 'Scout possibilities',
    output: 'Opportunity findings',
    visualDescription: 'Ribbed radar drum with one dominant circular sweep silhouette.',
    workflows: workflowsForMachine('opportunity-radar'),
    // Zone 13. It shared zone 02 with the News Array until the swap moved the drum
    // to the mid-east column and left the wall display in the corner; one zone could
    // not own both. The canonical workflow and prop are untouched — only which zone
    // it physically occupies moved, as for zones 10-12.
    areaId: 'opportunity-radar',
    propKeys: ['prop_radar_drum']
  })
]);

export const COMMAND_CENTER_WORKFLOW_AREAS = Object.freeze(
  Object.fromEntries(COMMAND_CENTER_WORKFLOWS.map((entry) => [entry.slug, entry.stationId]))
);

const MACHINE_BY_ID = new Map(COMMAND_CENTER_MACHINES.map((entry) => [entry.id, entry]));
const MACHINE_BY_WORKFLOW = new Map(
  COMMAND_CENTER_WORKFLOWS.map((entry) => [entry.slug, MACHINE_BY_ID.get(entry.machineId)])
);

function cleanToken(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]/g, '')
    .slice(0, 96);
}

export function machineById(machineId) {
  return MACHINE_BY_ID.get(cleanToken(machineId)) || null;
}

export function machineForWorkflow(workflow) {
  const workflowId = cleanToken(workflow && typeof workflow === 'object' ? workflow.workflow : workflow);
  return MACHINE_BY_WORKFLOW.get(workflowId) || null;
}

export function workflowCatalogEntry(workflow) {
  const workflowId = cleanToken(workflow && typeof workflow === 'object' ? workflow.workflow : workflow);
  return WORKFLOW_BY_SLUG.get(workflowId) || null;
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

function labelizeWorkflow(workflow) {
  return cleanToken(workflow)
    .split(/[-_.]+/g)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export function workflowLabelFor(workflow, suppliedLabel = '') {
  return workflowCatalogEntry(workflow)?.label
    || cleanWorkflowLabel(suppliedLabel)
    || labelizeWorkflow(workflow)
    || 'Unknown';
}

export function areaIdForWorkflow(workflow) {
  return workflowCatalogEntry(workflow)?.stationId || '';
}

export function machineDisplay(machine) {
  if (!machine) return null;
  return Object.freeze({
    id: machine.id,
    name: machine.name,
    shortName: machine.shortName,
    description: machine.description,
    purpose: machine.purpose,
    input: machine.input,
    work: machine.work,
    output: machine.output,
    visualDescription: machine.visualDescription,
    areaId: machine.areaId
  });
}
