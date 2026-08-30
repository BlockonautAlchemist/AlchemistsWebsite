// Semantic machine metadata for SpawnCamper9000/Hermes workflow mapping.
//
// This module deliberately contains no room geometry, draw bounds, asset paths,
// texture keys, frame data, or production-art metadata. sceneConfig.mjs remains
// the source of truth for physical placement and the whitebox fallback.

const job = (id, name = id) => Object.freeze({ id, name });

const machine = ({
  id,
  name,
  shortName,
  description,
  visualDescription,
  workflows = [],
  hermesJobs = [],
  areaId,
  propKeys = []
}) => Object.freeze({
  id,
  name,
  shortName,
  description,
  visualDescription,
  workflows: Object.freeze(workflows),
  hermesJobs: Object.freeze(hermesJobs),
  areaId,
  propKeys: Object.freeze(propKeys)
});

export const COMMAND_CENTER_MACHINES = Object.freeze([
  machine({
    id: 'news-array',
    name: 'News Array',
    shortName: 'News',
    description: 'Tracks AI gaming news and turns fresh source activity into intelligence.',
    visualDescription: 'Wall feed shells with cycling CRT cells and cyan packet activity.',
    workflows: ['ai-news'],
    hermesJobs: [job('ai-news', 'AI News')],
    areaId: 'intelligence-research',
    propKeys: ['prop_wall_feed_shells']
  }),
  machine({
    id: 'repo-forge',
    name: 'Repo Forge',
    shortName: 'Repos',
    description: 'Watches code repositories and engineering signals for useful changes.',
    visualDescription: 'Green code bench with a disk tower and phosphor terminal scroll.',
    workflows: ['github'],
    hermesJobs: [job('github', 'GitHub')],
    areaId: 'github-code',
    propKeys: ['prop_code_bench', 'prop_disk_tower']
  }),
  machine({
    id: 'tool-scanner',
    name: 'Tool Scanner',
    shortName: 'Tools',
    description: 'Scans new AI and game-development tools for actionable opportunities.',
    visualDescription: 'Long scanner bench with a moving cyan scan bar and ready lamp.',
    workflows: ['new-tools'],
    hermesJobs: [job('new-tools', 'New Tools')],
    areaId: 'scanner-bench',
    propKeys: ['prop_scanner_bench']
  }),
  machine({
    id: 'agent-lab',
    name: 'Agent Lab',
    shortName: 'Agents',
    description: 'Evaluates agent workflows and automation patterns.',
    visualDescription: 'Wall-mounted lab cabinet with a lit central incubation chamber.',
    workflows: ['agents'],
    hermesJobs: [job('agents', 'Agents')],
    areaId: 'agent-lab',
    propKeys: ['prop_wall_agent_lab']
  }),
  machine({
    id: 'model-furnace',
    name: 'Model Furnace',
    shortName: 'Models',
    description: 'Processes model infrastructure, routing, and evaluation telemetry.',
    visualDescription: 'Twin racks feeding an industrial chamber with heat and fan motion.',
    workflows: ['models-infra'],
    hermesJobs: [job('models-infra', 'Models Infra')],
    areaId: 'model-infrastructure',
    propKeys: ['prop_furnace_chamber', 'prop_rack_a', 'prop_rack_b']
  }),
  machine({
    id: 'creator-console',
    name: 'Creator Console',
    shortName: 'Creator',
    description: 'Shapes creator-facing intelligence and content angles.',
    visualDescription: 'Floor console with a three-cell editorial CRT row and signal traffic.',
    workflows: ['creator-content'],
    hermesJobs: [job('creator-content', 'Creator Content')],
    areaId: 'creator-console',
    propKeys: ['prop_creator_console']
  }),
  machine({
    id: 'profit-analyzer',
    name: 'Profit Analyzer',
    shortName: 'Profit',
    description: 'Reviews monetization, partner, and market opportunity signals.',
    visualDescription: 'Floor console with a gold analysis CRT row and warmer pulses.',
    workflows: ['monetization'],
    hermesJobs: [job('monetization', 'Monetization')],
    areaId: 'profit-analyzer',
    propKeys: ['prop_profit_analyzer']
  }),
  // Zone 09, the middle of the room. It shared the scanner bench with Tool Scanner
  // and Agent Lab until the Power Core — scenery with no Hermes job behind it — was
  // retired and this machine took its floor pocket. Workflow key, Hermes job and
  // every other semantic field are untouched; only where it physically stands moved.
  machine({
    id: 'experiment-bench',
    name: 'Experiment Bench',
    shortName: 'Playbooks',
    description: 'Turns discoveries into repeatable playbooks and experiments.',
    visualDescription: 'Wooden alchemist bench with potions, books, a glowing magical circle and spell effects.',
    workflows: ['playbooks'],
    hermesJobs: [job('playbooks', 'Playbooks')],
    areaId: 'experiment-bench',
    propKeys: ['prop_experiment_bench']
  }),
  machine({
    id: 'newsletter-still',
    name: 'Newsletter Still',
    shortName: 'Letter',
    description: 'Distills longer-form updates and deeper intelligence into newsletter output.',
    visualDescription: 'Tall distillation column with chamber fill, coil, and output tray.',
    workflows: ['newsletter'],
    hermesJobs: [job('newsletter', 'Newsletter'), job('finisher', 'Finisher')],
    areaId: 'newsletter',
    propKeys: ['prop_still_column', 'prop_still_tray']
  }),
  machine({
    id: 'x-uplink',
    name: 'X Uplink',
    shortName: 'X',
    description: 'Formats and transmits public X posts, highlights, and follow-up signals.',
    visualDescription: 'Communications console with CRT transport glyphs and antenna mast.',
    workflows: ['social-x'],
    hermesJobs: [
      job('x-draft', 'X Draft'),
      job('x-publish', 'X Publish'),
      job('x-amplify', 'X Amplify')
    ],
    areaId: 'x-communications',
    propKeys: ['prop_x_console', 'prop_x_mast']
  }),
  machine({
    id: 'publish-transmitter',
    name: 'Publish Transmitter',
    shortName: 'Publish',
    description: 'Pushes vetted terminal publishing and Beehiiv draft handoff events.',
    visualDescription: 'Heavy transmitter cabinet with a large CRT and charge meter.',
    workflows: ['terminal-publisher'],
    hermesJobs: [job('beehiiv-draft', 'Beehiiv Draft')],
    areaId: 'terminal-transmitter',
    propKeys: ['prop_tx_body']
  }),
  machine({
    id: 'opportunity-radar',
    name: 'Opportunity Radar',
    shortName: 'Radar',
    description: 'Reserved semantic mapping for the Hermes opportunity scout job.',
    visualDescription: 'Ribbed radar drum with one dominant circular sweep silhouette.',
    workflows: [],
    // Zone 13. It shared zone 02 with the News Array until the swap moved the drum
    // to the mid-east column and left the wall display in the corner; one zone could
    // not own both. Hermes job, the deliberately empty workflow list and the prop are
    // untouched — only which zone it physically occupies moved, as for zones 10-12.
    hermesJobs: [job('254525fa846f', 'Opportunity Scout')],
    areaId: 'opportunity-radar',
    propKeys: ['prop_radar_drum']
  })
]);

export const COMMAND_CENTER_WORKFLOW_AREAS = Object.freeze(
  Object.fromEntries(
    COMMAND_CENTER_MACHINES.flatMap((entry) => (
      entry.workflows.map((workflow) => [workflow, entry.areaId])
    ))
  )
);

// Which workstation the *activity* belongs to, as opposed to which machine owns
// the Hermes job. This is the normal production path: a single job that moves
// through researching -> evaluating -> writing -> terminal_publish walks
// SpawnCamper across the room, because the work genuinely moved. The map above
// stays the fallback and still answers "whose job is this".
//
// Five states are deliberately absent, and their absence is the feature:
//
//   idle, waiting, complete, warning, error
//
// None of them names an activity, so none of them names a workstation. They fall
// through to the workflow's own machine, which is what makes a job finish where
// it was being worked and an error stay put instead of teleporting him mid-fault.
//
// Assignments are a table edit, not an architecture change: rearranging the room
// later means editing the right-hand column here and nothing else.
export const COMMAND_CENTER_STATE_AREAS = Object.freeze({
  researching: 'intelligence-research',
  browsing: 'intelligence-research',
  scanning: 'scanner-bench',
  evaluating: 'profit-analyzer',
  thinking: 'central-operations',
  writing: 'creator-console',
  coding: 'github-code',
  processing: 'model-infrastructure',
  executing: 'model-infrastructure',
  newsletter: 'newsletter',
  publishing: 'terminal-transmitter',
  terminal_publish: 'terminal-transmitter',
  posting_to_x: 'x-communications'
});

const MACHINE_BY_ID = new Map(COMMAND_CENTER_MACHINES.map((entry) => [entry.id, entry]));
const MACHINE_BY_WORKFLOW = new Map(
  COMMAND_CENTER_MACHINES.flatMap((entry) => entry.workflows.map((workflow) => [workflow, entry]))
);

function cleanToken(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]/g, '')
    .slice(0, 96);
}

function slugToken(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

function tokenVariants(value) {
  return [...new Set([cleanToken(value), slugToken(value)].filter(Boolean))];
}

const MACHINE_BY_HERMES_JOB = new Map();
COMMAND_CENTER_MACHINES.forEach((entry) => {
  entry.hermesJobs.forEach((hermesJob) => {
    [...tokenVariants(hermesJob.id), ...tokenVariants(hermesJob.name)].forEach((token) => {
      if (!MACHINE_BY_HERMES_JOB.has(token)) MACHINE_BY_HERMES_JOB.set(token, entry);
    });
  });
});

export function machineById(machineId) {
  return MACHINE_BY_ID.get(cleanToken(machineId)) || null;
}

export function machineForWorkflow(workflow) {
  const workflowId = cleanToken(workflow && typeof workflow === 'object' ? workflow.workflow : workflow);
  return MACHINE_BY_WORKFLOW.get(workflowId) || null;
}

export function machineForHermesJobId(jobId) {
  const value = jobId && typeof jobId === 'object'
    ? jobId.id || jobId.jobId || jobId.slug || jobId.name
    : jobId;
  const candidates = tokenVariants(value);
  for (const candidate of candidates) {
    const entry = MACHINE_BY_HERMES_JOB.get(candidate);
    if (entry) return entry;
  }
  return null;
}

export function areaIdForWorkflow(workflow) {
  return machineForWorkflow(workflow)?.areaId || '';
}

/** '' for a state with no workstation of its own — see COMMAND_CENTER_STATE_AREAS. */
export function areaIdForState(state) {
  return COMMAND_CENTER_STATE_AREAS[cleanToken(state)] || '';
}

export function machineDisplay(machine) {
  if (!machine) return null;
  return Object.freeze({
    id: machine.id,
    name: machine.name,
    shortName: machine.shortName,
    description: machine.description,
    visualDescription: machine.visualDescription,
    areaId: machine.areaId
  });
}
