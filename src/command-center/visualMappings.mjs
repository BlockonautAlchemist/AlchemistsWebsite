export const STATE_VISUALS = Object.freeze({
  idle: Object.freeze({
    label: 'Idle',
    agentMode: 'idle',
    stationMode: 'idle',
    tint: 0xaeb8b0,
    stationTint: 0x7c8a82,
    pulse: false,
    packets: false,
    severity: 'idle'
  }),
  researching: Object.freeze({
    label: 'Research',
    agentMode: 'thinking',
    stationMode: 'active',
    tint: 0x78f4c2,
    stationTint: 0x78f4c2,
    pulse: true,
    packets: true,
    severity: 'active'
  }),
  browsing: Object.freeze({
    label: 'Browsing',
    agentMode: 'walk_right',
    stationMode: 'active',
    tint: 0x4fb7ff,
    stationTint: 0x4fb7ff,
    pulse: true,
    packets: true,
    severity: 'active'
  }),
  scanning: Object.freeze({
    label: 'Scanning',
    agentMode: 'thinking',
    stationMode: 'active',
    tint: 0xa2e665,
    stationTint: 0xa2e665,
    pulse: true,
    packets: true,
    severity: 'active'
  }),
  evaluating: Object.freeze({
    label: 'Evaluating',
    agentMode: 'thinking',
    stationMode: 'active',
    tint: 0xf5c65a,
    stationTint: 0xf5c65a,
    pulse: true,
    packets: true,
    severity: 'active'
  }),
  thinking: Object.freeze({
    label: 'Thinking',
    agentMode: 'thinking',
    stationMode: 'active',
    tint: 0xd58cff,
    stationTint: 0xd58cff,
    pulse: true,
    packets: false,
    severity: 'active'
  }),
  writing: Object.freeze({
    label: 'Writing',
    agentMode: 'typing',
    stationMode: 'active',
    tint: 0xf5c65a,
    stationTint: 0xf5c65a,
    pulse: true,
    packets: true,
    severity: 'active'
  }),
  coding: Object.freeze({
    label: 'Coding',
    agentMode: 'typing',
    stationMode: 'active',
    tint: 0x7b98ff,
    stationTint: 0x7b98ff,
    pulse: true,
    packets: true,
    severity: 'active'
  }),
  processing: Object.freeze({
    label: 'Processing',
    agentMode: 'typing',
    stationMode: 'active',
    tint: 0x6fd6b9,
    stationTint: 0x6fd6b9,
    pulse: true,
    packets: true,
    severity: 'active'
  }),
  executing: Object.freeze({
    label: 'Executing',
    agentMode: 'walk_up',
    stationMode: 'active',
    tint: 0xff8f61,
    stationTint: 0xff8f61,
    pulse: true,
    packets: true,
    severity: 'active'
  }),
  publishing: Object.freeze({
    label: 'Publishing',
    agentMode: 'typing',
    stationMode: 'active',
    tint: 0xffd36a,
    stationTint: 0xffd36a,
    pulse: true,
    packets: true,
    severity: 'active'
  }),
  posting_to_x: Object.freeze({
    label: 'X Post',
    agentMode: 'typing',
    stationMode: 'active',
    tint: 0x4fb7ff,
    stationTint: 0x4fb7ff,
    pulse: true,
    packets: true,
    severity: 'active'
  }),
  newsletter: Object.freeze({
    label: 'Newsletter',
    agentMode: 'typing',
    stationMode: 'active',
    tint: 0xa2e665,
    stationTint: 0xa2e665,
    pulse: true,
    packets: true,
    severity: 'active'
  }),
  terminal_publish: Object.freeze({
    label: 'Terminal',
    agentMode: 'typing',
    stationMode: 'active',
    tint: 0xff68d2,
    stationTint: 0xff68d2,
    pulse: true,
    packets: true,
    severity: 'active'
  }),
  waiting: Object.freeze({
    label: 'Waiting',
    agentMode: 'idle',
    stationMode: 'warning',
    tint: 0xd6caa0,
    stationTint: 0xd6caa0,
    pulse: false,
    packets: false,
    severity: 'waiting'
  }),
  complete: Object.freeze({
    label: 'Complete',
    agentMode: 'celebrate_small',
    stationMode: 'complete',
    tint: 0x8cff9d,
    stationTint: 0x8cff9d,
    pulse: false,
    packets: false,
    severity: 'complete'
  }),
  warning: Object.freeze({
    label: 'Warning',
    agentMode: 'error',
    stationMode: 'warning',
    tint: 0xffcf5a,
    stationTint: 0xffcf5a,
    pulse: true,
    packets: false,
    severity: 'warning'
  }),
  error: Object.freeze({
    label: 'Error',
    agentMode: 'error',
    stationMode: 'error',
    tint: 0xff5c77,
    stationTint: 0xff5c77,
    pulse: true,
    packets: false,
    severity: 'error'
  })
});

export function visualForState(state) {
  return STATE_VISUALS[state] || STATE_VISUALS.idle;
}

export function isActiveVisual(state) {
  const visual = visualForState(state);
  return visual.severity === 'active' || visual.severity === 'waiting';
}
