import { COMMAND_CENTER_PALETTE } from './sceneConfig.mjs';

const P = COMMAND_CENTER_PALETTE;

// Section 03 sprite sheet rows. Every camper mode resolves to one of these six, so
// spawncamper_9000.png (8x6 grid, 384x384, 37 frames) drops in without remapping.
export const CAMPER_ANIMATIONS = Object.freeze([
  'idle',
  'hover_travel_front',
  'hover_travel_back',
  'operate',
  'inspect',
  'react'
]);

// Section 04 state animation language. Every telemetry state maps to a local event
// on one machine — the room never changes globally, which is what keeps concurrent
// workflows legible and a single error pleasant to watch.
//
//   components  L3 keys that switch from their ambient loop to their operational one
//   conduits    L5 packet routes that fire (section 05 ids)
//   rate        loop-rate multiplier; warning/stale run the same loops at 60%
//   effect      pooled L5 one-shot or emitter
export const STATE_VISUALS = Object.freeze({
  idle: Object.freeze({
    label: 'Idle',
    agentMode: 'idle',
    camperAnim: 'idle',
    areaMode: 'ambient',
    tint: P.inkMuted,
    areaTint: P.inkMuted,
    stationTint: P.inkMuted,
    pulse: false,
    packets: false,
    severity: 'idle',
    effect: 'none',
    rate: 1,
    components: Object.freeze([]),
    conduits: Object.freeze([])
  }),
  researching: Object.freeze({
    label: 'Research',
    agentMode: 'focus',
    camperAnim: 'inspect',
    areaMode: 'radar',
    tint: P.cyan,
    areaTint: P.cyan,
    stationTint: P.cyan,
    pulse: true,
    packets: true,
    severity: 'active',
    effect: 'scan',
    rate: 1,
    components: Object.freeze(['anim_radar_sweep', 'anim_feed_cycle']),
    conduits: Object.freeze(['SP', 'D1'])
  }),
  browsing: Object.freeze({
    label: 'Browsing',
    agentMode: 'glide',
    camperAnim: 'hover_travel_front',
    areaMode: 'radar',
    tint: P.cyan,
    areaTint: P.cyan,
    stationTint: P.cyan,
    pulse: true,
    packets: true,
    severity: 'active',
    effect: 'packets',
    rate: 1,
    components: Object.freeze(['anim_radar_sweep', 'anim_feed_cycle']),
    conduits: Object.freeze(['SP', 'D1'])
  }),
  scanning: Object.freeze({
    label: 'Scanning',
    agentMode: 'focus',
    camperAnim: 'inspect',
    areaMode: 'scanner',
    tint: P.cyan,
    areaTint: P.cyan,
    stationTint: P.cyan,
    pulse: true,
    packets: true,
    severity: 'active',
    effect: 'scan',
    rate: 1,
    components: Object.freeze(['anim_scan_bar', 'anim_scan_lamp', 'anim_radar_sweep']),
    conduits: Object.freeze(['SP', 'D1'])
  }),
  evaluating: Object.freeze({
    label: 'Evaluating',
    agentMode: 'focus',
    camperAnim: 'inspect',
    areaMode: 'core',
    tint: P.gold,
    areaTint: P.gold,
    stationTint: P.gold,
    pulse: true,
    packets: true,
    severity: 'active',
    effect: 'orbit',
    rate: 1.25,
    components: Object.freeze(['anim_ops_desk_screens']),
    conduits: Object.freeze(['SP', 'D3'])
  }),
  thinking: Object.freeze({
    label: 'Thinking',
    agentMode: 'focus',
    camperAnim: 'inspect',
    areaMode: 'core',
    tint: P.brand,
    areaTint: P.brand,
    stationTint: P.brand,
    pulse: true,
    packets: false,
    severity: 'active',
    effect: 'orbit',
    rate: 1.25,
    components: Object.freeze([]),
    conduits: Object.freeze(['D3'])
  }),
  writing: Object.freeze({
    label: 'Writing',
    agentMode: 'interact',
    camperAnim: 'operate',
    areaMode: 'draft',
    tint: P.magenta,
    areaTint: P.magenta,
    stationTint: P.magenta,
    pulse: true,
    packets: true,
    severity: 'active',
    effect: 'caret',
    rate: 1,
    components: Object.freeze(['anim_x_crt', 'anim_keyboard_leds']),
    conduits: Object.freeze(['SP', 'D4'])
  }),
  coding: Object.freeze({
    label: 'Coding',
    agentMode: 'interact',
    camperAnim: 'operate',
    areaMode: 'draft',
    tint: P.phosphor,
    areaTint: P.phosphor,
    stationTint: P.phosphor,
    pulse: true,
    packets: true,
    severity: 'active',
    effect: 'caret',
    rate: 1,
    components: Object.freeze(['anim_code_scroll', 'anim_code_leds', 'anim_disk_reel']),
    conduits: Object.freeze(['SP', 'D9'])
  }),
  processing: Object.freeze({
    label: 'Processing',
    agentMode: 'interact',
    camperAnim: 'operate',
    areaMode: 'chamber',
    tint: P.brand,
    areaTint: P.brand,
    stationTint: P.brand,
    pulse: true,
    packets: true,
    severity: 'active',
    effect: 'packets',
    rate: 1,
    components: Object.freeze(['anim_still_chamber', 'anim_still_coil', 'anim_furnace_heat', 'anim_fan']),
    conduits: Object.freeze(['SP', 'D2', 'D7'])
  }),
  executing: Object.freeze({
    label: 'Executing',
    agentMode: 'glide',
    camperAnim: 'hover_travel_front',
    areaMode: 'chamber',
    tint: P.warm,
    areaTint: P.warm,
    stationTint: P.warm,
    pulse: true,
    packets: true,
    severity: 'active',
    effect: 'packets',
    rate: 1,
    components: Object.freeze(['anim_furnace_heat', 'anim_fan', 'anim_rack_leds']),
    conduits: Object.freeze(['SP', 'D7'])
  }),
  publishing: Object.freeze({
    label: 'Publishing',
    agentMode: 'transmit',
    camperAnim: 'operate',
    areaMode: 'transmit',
    tint: P.gold,
    areaTint: P.gold,
    stationTint: P.gold,
    pulse: true,
    packets: true,
    severity: 'active',
    effect: 'transmit',
    rate: 1,
    components: Object.freeze(['anim_tx_crt', 'anim_tx_charge']),
    conduits: Object.freeze(['SP', 'D6'])
  }),
  posting_to_x: Object.freeze({
    label: 'X Post',
    agentMode: 'transmit',
    camperAnim: 'operate',
    areaMode: 'uplink',
    tint: P.magenta,
    areaTint: P.magenta,
    stationTint: P.magenta,
    pulse: true,
    packets: true,
    severity: 'active',
    effect: 'beam',
    rate: 1,
    components: Object.freeze(['anim_x_crt', 'anim_x_lamps', 'anim_x_dish']),
    conduits: Object.freeze(['SP', 'D4', 'D5'])
  }),
  newsletter: Object.freeze({
    label: 'Newsletter',
    agentMode: 'transmit',
    camperAnim: 'operate',
    areaMode: 'chamber',
    tint: P.brand,
    areaTint: P.brand,
    stationTint: P.brand,
    pulse: true,
    packets: true,
    severity: 'active',
    effect: 'transmit',
    rate: 1,
    components: Object.freeze(['anim_still_chamber', 'anim_still_coil', 'anim_tray_print']),
    conduits: Object.freeze(['SP', 'D2'])
  }),
  terminal_publish: Object.freeze({
    label: 'Terminal',
    agentMode: 'transmit',
    camperAnim: 'operate',
    areaMode: 'transmit',
    tint: P.gold,
    areaTint: P.gold,
    stationTint: P.gold,
    pulse: true,
    packets: true,
    severity: 'active',
    effect: 'transmit',
    rate: 1,
    components: Object.freeze(['anim_tx_crt', 'anim_tx_charge', 'anim_tx_pilot']),
    conduits: Object.freeze(['SP', 'D6', 'D8'])
  }),
  waiting: Object.freeze({
    label: 'Waiting',
    agentMode: 'idle',
    camperAnim: 'idle',
    areaMode: 'standby',
    tint: P.warn,
    areaTint: P.warn,
    stationTint: P.warn,
    pulse: true,
    packets: false,
    severity: 'waiting',
    effect: 'standby',
    rate: 0.6,
    components: Object.freeze([]),
    conduits: Object.freeze([])
  }),
  complete: Object.freeze({
    label: 'Complete',
    agentMode: 'complete',
    camperAnim: 'idle',
    areaMode: 'complete',
    tint: P.phosphor,
    areaTint: P.phosphor,
    stationTint: P.phosphor,
    pulse: false,
    packets: false,
    severity: 'complete',
    effect: 'success',
    rate: 1,
    components: Object.freeze([]),
    conduits: Object.freeze([])
  }),
  warning: Object.freeze({
    label: 'Warning',
    agentMode: 'error',
    camperAnim: 'react',
    areaMode: 'warning',
    tint: P.warn,
    areaTint: P.warn,
    stationTint: P.warn,
    pulse: true,
    packets: false,
    severity: 'warning',
    // Section 04: amber lamp on that machine, its loop slows to 60%. Room untouched.
    effect: 'lamp',
    rate: 0.6,
    components: Object.freeze([]),
    conduits: Object.freeze([])
  }),
  error: Object.freeze({
    label: 'Error',
    agentMode: 'error',
    camperAnim: 'react',
    areaMode: 'error',
    tint: P.magenta,
    areaTint: P.magenta,
    stationTint: P.magenta,
    pulse: true,
    packets: false,
    severity: 'error',
    // Section 04: local malfunction only — static band, 3px jitter, one spark, red
    // pilot. Camper plays react once, then resumes. No full-screen overlay.
    effect: 'glitch',
    rate: 0.6,
    components: Object.freeze([]),
    conduits: Object.freeze([])
  })
});

// Section 04 timings for the shared one-shots.
export const COMMAND_CENTER_TIMINGS = Object.freeze({
  completeFlashMs: 600,
  completeSettleMs: 1200,
  reactMs: 500,
  glitchJitterPx: 3,
  staleRate: 0.6
});

export function visualForState(state) {
  return STATE_VISUALS[state] || STATE_VISUALS.idle;
}

export function isActiveVisual(state) {
  const visual = visualForState(state);
  return visual.severity === 'active' || visual.severity === 'waiting';
}

export function camperAnimationFor(state) {
  return visualForState(state).camperAnim;
}

export function operationalComponentsFor(state) {
  return visualForState(state).components;
}

export function conduitsForState(state) {
  return visualForState(state).conduits;
}
