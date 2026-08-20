export const COMMAND_CENTER_CANVAS = Object.freeze({
  width: 1280,
  height: 720,
  tileSize: 32,
  idlePoint: Object.freeze({ x: 640, y: 360 })
});

export const COMMAND_CENTER_ASSETS = Object.freeze([
  Object.freeze({
    type: 'svg',
    key: 'cc-background',
    url: '/assets/command-center/placeholder/background.svg',
    width: 1280,
    height: 720
  }),
  Object.freeze({
    type: 'svg',
    key: 'cc-agent',
    url: '/assets/command-center/placeholder/agent.svg',
    width: 96,
    height: 96
  }),
  Object.freeze({
    type: 'svg',
    key: 'cc-station',
    url: '/assets/command-center/placeholder/station.svg',
    width: 128,
    height: 128
  }),
  Object.freeze({
    type: 'svg',
    key: 'cc-packet',
    url: '/assets/command-center/placeholder/packet.svg',
    width: 32,
    height: 32
  })
]);

export const COMMAND_CENTER_STATIONS = Object.freeze([
  Object.freeze({
    id: 'research',
    label: 'Research',
    x: 216,
    y: 156,
    destination: Object.freeze({ x: 244, y: 246 }),
    hitArea: Object.freeze({ width: 180, height: 124 }),
    packetRoute: Object.freeze([{ x: 640, y: 360 }, { x: 216, y: 156 }])
  }),
  Object.freeze({
    id: 'scanner',
    label: 'Scanner',
    x: 428,
    y: 138,
    destination: Object.freeze({ x: 448, y: 232 }),
    hitArea: Object.freeze({ width: 180, height: 124 }),
    packetRoute: Object.freeze([{ x: 640, y: 360 }, { x: 428, y: 138 }])
  }),
  Object.freeze({
    id: 'github',
    label: 'GitHub',
    x: 640,
    y: 130,
    destination: Object.freeze({ x: 640, y: 226 }),
    hitArea: Object.freeze({ width: 180, height: 124 }),
    packetRoute: Object.freeze([{ x: 640, y: 360 }, { x: 640, y: 130 }])
  }),
  Object.freeze({
    id: 'models',
    label: 'Models',
    x: 852,
    y: 138,
    destination: Object.freeze({ x: 832, y: 232 }),
    hitArea: Object.freeze({ width: 180, height: 124 }),
    packetRoute: Object.freeze([{ x: 640, y: 360 }, { x: 852, y: 138 }])
  }),
  Object.freeze({
    id: 'creator',
    label: 'Creator',
    x: 1064,
    y: 156,
    destination: Object.freeze({ x: 1036, y: 246 }),
    hitArea: Object.freeze({ width: 180, height: 124 }),
    packetRoute: Object.freeze([{ x: 640, y: 360 }, { x: 1064, y: 156 }])
  }),
  Object.freeze({
    id: 'monetization',
    label: 'Money Ops',
    x: 208,
    y: 360,
    destination: Object.freeze({ x: 312, y: 366 }),
    hitArea: Object.freeze({ width: 190, height: 132 }),
    packetRoute: Object.freeze([{ x: 640, y: 360 }, { x: 208, y: 360 }])
  }),
  Object.freeze({
    id: 'playbooks',
    label: 'Playbooks',
    x: 422,
    y: 426,
    destination: Object.freeze({ x: 496, y: 402 }),
    hitArea: Object.freeze({ width: 190, height: 132 }),
    packetRoute: Object.freeze([{ x: 640, y: 360 }, { x: 422, y: 426 }])
  }),
  Object.freeze({
    id: 'newsletter',
    label: 'Newsletter',
    x: 640,
    y: 486,
    destination: Object.freeze({ x: 640, y: 410 }),
    hitArea: Object.freeze({ width: 190, height: 132 }),
    packetRoute: Object.freeze([{ x: 640, y: 360 }, { x: 640, y: 486 }])
  }),
  Object.freeze({
    id: 'social-x',
    label: 'X Desk',
    x: 858,
    y: 426,
    destination: Object.freeze({ x: 784, y: 402 }),
    hitArea: Object.freeze({ width: 190, height: 132 }),
    packetRoute: Object.freeze([{ x: 640, y: 360 }, { x: 858, y: 426 }])
  }),
  Object.freeze({
    id: 'terminal-publisher',
    label: 'Terminal',
    x: 1072,
    y: 360,
    destination: Object.freeze({ x: 968, y: 366 }),
    hitArea: Object.freeze({ width: 190, height: 132 }),
    packetRoute: Object.freeze([{ x: 640, y: 360 }, { x: 1072, y: 360 }])
  }),
  Object.freeze({
    id: 'servers',
    label: 'Servers',
    x: 340,
    y: 612,
    destination: Object.freeze({ x: 430, y: 556 }),
    hitArea: Object.freeze({ width: 190, height: 104 }),
    packetRoute: Object.freeze([{ x: 640, y: 360 }, { x: 340, y: 612 }])
  }),
  Object.freeze({
    id: 'uplink',
    label: 'Uplink',
    x: 940,
    y: 612,
    destination: Object.freeze({ x: 850, y: 556 }),
    hitArea: Object.freeze({ width: 190, height: 104 }),
    packetRoute: Object.freeze([{ x: 640, y: 360 }, { x: 940, y: 612 }])
  })
]);

export const COMMAND_CENTER_WORKFLOW_STATIONS = Object.freeze({
  'ai-news': 'research',
  'new-tools': 'scanner',
  github: 'github',
  agents: 'research',
  'models-infra': 'models',
  'creator-content': 'creator',
  monetization: 'monetization',
  playbooks: 'playbooks',
  newsletter: 'newsletter',
  'terminal-publisher': 'terminal-publisher',
  'social-x': 'social-x'
});

export const COMMAND_CENTER_AGENT_ANIMATIONS = Object.freeze({
  idle: Object.freeze({ frames: 4, fps: 4 }),
  walk_down: Object.freeze({ frames: 6, fps: 8 }),
  walk_up: Object.freeze({ frames: 6, fps: 8 }),
  walk_left: Object.freeze({ frames: 6, fps: 8 }),
  walk_right: Object.freeze({ frames: 6, fps: 8 }),
  typing: Object.freeze({ frames: 6, fps: 8 }),
  thinking: Object.freeze({ frames: 4, fps: 4 }),
  error: Object.freeze({ frames: 4, fps: 5 }),
  celebrate_small: Object.freeze({ frames: 4, fps: 6 })
});

export const COMMAND_CENTER_STATION_ANIMATIONS = Object.freeze({
  idle: Object.freeze({ frames: 1, fps: 1 }),
  active: Object.freeze({ frames: 4, fps: 6 }),
  warning: Object.freeze({ frames: 4, fps: 5 }),
  error: Object.freeze({ frames: 4, fps: 5 }),
  complete: Object.freeze({ frames: 4, fps: 5 })
});

export const COMMAND_CENTER_FALLBACK_STATION_ID = 'uplink';

const STATION_BY_ID = new Map(COMMAND_CENTER_STATIONS.map((station) => [station.id, station]));

export function stationById(stationId) {
  return STATION_BY_ID.get(stationId) || STATION_BY_ID.get(COMMAND_CENTER_FALLBACK_STATION_ID);
}

export function stationIdForWorkflow(workflow) {
  const contextStation = workflow && workflow.context && workflow.context.station;
  if (contextStation && STATION_BY_ID.has(contextStation)) return contextStation;

  const workflowId = workflow && workflow.workflow;
  return COMMAND_CENTER_WORKFLOW_STATIONS[workflowId] || COMMAND_CENTER_FALLBACK_STATION_ID;
}
