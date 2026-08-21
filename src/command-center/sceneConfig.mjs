// Geometry, palette and asset registry for the SpawnCamper9000 Command Center.
//
// Every coordinate here is transcribed from the Claude Design "SpawnCamper Command
// Center" bible (REV 01). Sections referenced below map to that document:
//   01 geometry lock          02 layer decomposition     03 SpawnCamper sprite
//   04 state animation        05 data flow & conduits     08 asset specification
//   10 mobile reframing       11 Phaser notes & budget
//
// The scene ships as the design's scale-true whitebox. Every prop and component
// carries the section 08 filename it is waiting for, so generated pixel art drops
// into the same rectangle without touching a single coordinate.

// Section 09 palette block. The whole facility is drawn from this 16-colour ramp.
export const COMMAND_CENTER_PALETTE = Object.freeze({
  void: 0x0d0214,
  bg0: 0x160420,
  bg1: 0x1e0729,
  bg2: 0x240a31,
  bg3: 0x2b0d3c,
  bg4: 0x3a1450,
  brand: 0xad19d1,
  magenta: 0xff2e97,
  gold: 0xfed66d,
  cyan: 0x5cfbf7,
  phosphor: 0x39ff88,
  warm: 0xff7a2f,
  ink: 0xf8edff,
  inkMuted: 0xb89aca,
  line: 0xc78ef5,
  warn: 0xffd98a
});

// Section 01 geometry lock.
export const COMMAND_CENTER_CANVAS = Object.freeze({
  width: 960,
  height: 528,
  tileSize: 24,
  gridCols: 40,
  gridRows: 22,
  wallBandHeight: 120,
  floorTop: 120,
  walkwayTop: 480,
  // The camper idles at the zone 01 anchor, not at a separate home marker.
  homePoint: Object.freeze({ x: 480, y: 228 }),
  idlePoint: Object.freeze({ x: 480, y: 228 })
});

// Section 10 mobile reframing.
export const COMMAND_CENTER_CAMERA = Object.freeze({
  desktopWideMinWidth: 1280,
  desktopZoom: 2,
  baseZoom: 1,
  phoneZoom: 2,
  phoneMaxWidth: 760,
  minLogicalWidth: 340,
  focusWindow: Object.freeze({ width: 384, height: 336 }),
  focusLerpMs: 600,
  focusHoldMs: 8000,
  idleFocus: Object.freeze({ x: 480, y: 300 })
});

export const COMMAND_CENTER_COMPLETE_ACK_MS = 30000;

// Section 11 performance budget.
export const COMMAND_CENTER_BUDGET = Object.freeze({
  maxPackets: 6,
  maxFxSprites: 12,
  maxOperationalAnimations: 8,
  idleSpineIntervalMs: 9000,
  handoffEmphasisMs: 400
});

const ART_ROOT = '/assets/command-center';

// ---------------------------------------------------------------------------
// L1 · static environment (section 08: env_floor_wall.png, env_conduit_channels.png)
// ---------------------------------------------------------------------------

export const COMMAND_CENTER_ENVIRONMENT = Object.freeze({
  art: `${ART_ROOT}/env_floor_wall.png`,
  conduitArt: `${ART_ROOT}/env_conduit_channels.png`,
  floorFill: COMMAND_CENTER_PALETTE.bg1,
  floorTileFill: 0x22092e,
  wallTop: COMMAND_CENTER_PALETTE.bg0,
  wallBottom: 0x1c0627,
  wallTrim: COMMAND_CENTER_PALETTE.bg4,
  pipeFill: 0x2a0c3a,
  stencils: Object.freeze([
    Object.freeze({ x: 288, y: 60, text: 'AUTH PERSONNEL ONLY' }),
    Object.freeze({ x: 660, y: 60, text: 'SECTOR 7 · TRANSMUTE' })
  ]),
  floorMarkings: Object.freeze([
    Object.freeze({ x: 24, y: 492, w: 912, h: 2, color: COMMAND_CENTER_PALETTE.gold, alpha: 0.14 }),
    Object.freeze({ x: 24, y: 132, w: 2, h: 360, color: COMMAND_CENTER_PALETTE.gold, alpha: 0.1 }),
    Object.freeze({ x: 934, y: 132, w: 2, h: 360, color: COMMAND_CENTER_PALETTE.gold, alpha: 0.1 }),
    Object.freeze({ x: 0, y: 456, w: 960, h: 1, color: COMMAND_CENTER_PALETTE.void, alpha: 0.6 })
  ]),
  edgeLabels: Object.freeze([
    Object.freeze({ x: 600, y: 6, text: '↑ X / EXTERNAL UPLINK', color: COMMAND_CENTER_PALETTE.magenta, alpha: 0.85 }),
    Object.freeze({ x: 806, y: 414, text: '→ GA TERMINAL', color: COMMAND_CENTER_PALETTE.gold, alpha: 0.85 }),
    Object.freeze({ x: 10, y: 498, text: '← PUBLIC SITE', color: COMMAND_CENTER_PALETTE.line, alpha: 0.7 })
  ])
});

// ---------------------------------------------------------------------------
// L2 · static prop bodies (section 08). `parts` are the design's whitebox rects,
// relative to the prop box; `art` is the pixel-art file that replaces them.
// ---------------------------------------------------------------------------

const SHELL = COMMAND_CENTER_PALETTE.bg3;
const SHELL_TOP = COMMAND_CENTER_PALETTE.bg4;
const SHELL_LINE = COMMAND_CENTER_PALETTE.line;
const SHELL_DARK = COMMAND_CENTER_PALETTE.bg2;

function deskParts(width, height, topHeight) {
  return [
    { x: 0, y: topHeight - 2, w: width, h: height - topHeight + 2, fill: SHELL, stroke: SHELL_LINE, strokeAlpha: 0.28, shadow: 4 },
    { x: 0, y: 0, w: width, h: topHeight, fill: SHELL_TOP, stroke: SHELL_LINE, strokeAlpha: 0.28 }
  ];
}

export const COMMAND_CENTER_PROPS = Object.freeze([
  Object.freeze({
    key: 'prop_wall_crt_bank',
    zone: 'central-operations',
    art: `${ART_ROOT}/prop_wall_crt_bank.png`,
    x: 372, y: 24, w: 216, h: 84,
    parts: Object.freeze([{ x: 0, y: 0, w: 216, h: 84, fill: SHELL_DARK, stroke: SHELL_TOP, strokeWidth: 2, inset: 0.2 }])
  }),
  Object.freeze({
    key: 'prop_ops_console',
    zone: 'central-operations',
    art: `${ART_ROOT}/prop_ops_console.png`,
    x: 384, y: 144, w: 192, h: 72,
    parts: Object.freeze(deskParts(192, 72, 20))
  }),
  Object.freeze({
    key: 'prop_wall_feed_shells',
    zone: 'intelligence-research',
    art: `${ART_ROOT}/prop_wall_feed_shells.png`,
    x: 48, y: 40, w: 232, h: 38,
    parts: Object.freeze([0, 60, 120, 180].map((offset) => ({
      x: offset, y: 0, w: 52, h: 38, fill: SHELL_DARK, stroke: SHELL_TOP, strokeWidth: 2
    })))
  }),
  Object.freeze({
    key: 'prop_radar_drum',
    zone: 'intelligence-research',
    art: `${ART_ROOT}/prop_radar_drum.png`,
    x: 72, y: 168, w: 96, h: 72,
    parts: Object.freeze([
      { x: 0, y: 22, w: 96, h: 50, fill: SHELL, stroke: SHELL_LINE, strokeAlpha: 0.28, shadow: 4 },
      { x: 0, y: 0, w: 96, h: 24, fill: SHELL_TOP, stroke: SHELL_LINE, strokeAlpha: 0.28, radius: Object.freeze([48, 48, 0, 0]) }
    ])
  }),
  Object.freeze({
    key: 'prop_scanner_bench',
    zone: 'scanner-bench',
    art: `${ART_ROOT}/prop_scanner_bench.png`,
    x: 48, y: 264, w: 168, h: 48,
    parts: Object.freeze(deskParts(168, 48, 16))
  }),
  Object.freeze({
    key: 'prop_code_bench',
    zone: 'github-code',
    art: `${ART_ROOT}/prop_code_bench.png`,
    x: 48, y: 384, w: 168, h: 72,
    parts: Object.freeze(deskParts(168, 72, 22))
  }),
  Object.freeze({
    key: 'prop_disk_tower',
    zone: 'github-code',
    art: `${ART_ROOT}/prop_disk_tower.png`,
    x: 228, y: 384, w: 36, h: 72,
    parts: Object.freeze([{ x: 0, y: 0, w: 36, h: 72, fill: SHELL_DARK, stroke: SHELL_LINE, strokeAlpha: 0.28, shadow: 4 }])
  }),
  Object.freeze({
    key: 'prop_still_column',
    zone: 'newsletter',
    art: `${ART_ROOT}/prop_still_column.png`,
    x: 264, y: 312, w: 72, h: 144,
    parts: Object.freeze([
      { x: 6, y: 0, w: 60, h: 144, fill: SHELL, stroke: SHELL_LINE, strokeAlpha: 0.28, radius: Object.freeze([30, 30, 4, 4]), shadow: 4 },
      { x: 0, y: 36, w: 72, h: 8, fill: SHELL_TOP },
      { x: 0, y: 104, w: 72, h: 8, fill: SHELL_TOP }
    ])
  }),
  Object.freeze({
    key: 'prop_still_tray',
    zone: 'newsletter',
    art: `${ART_ROOT}/prop_still_tray.png`,
    x: 348, y: 408, w: 60, h: 48,
    parts: Object.freeze([{ x: 0, y: 0, w: 60, h: 48, fill: SHELL, stroke: SHELL_LINE, strokeAlpha: 0.28, shadow: 4 }])
  }),
  Object.freeze({
    key: 'prop_x_console',
    zone: 'x-communications',
    art: `${ART_ROOT}/prop_x_console.png`,
    x: 456, y: 384, w: 144, h: 72,
    parts: Object.freeze(deskParts(144, 72, 22))
  }),
  Object.freeze({
    key: 'prop_x_mast',
    zone: 'x-communications',
    art: `${ART_ROOT}/prop_x_mast.png`,
    x: 576, y: 276, w: 48, h: 108,
    parts: Object.freeze([
      { x: 12, y: 12, w: 24, h: 96, fill: SHELL, stroke: SHELL_LINE, strokeAlpha: 0.28 },
      { x: 0, y: 0, w: 48, h: 14, fill: SHELL_TOP, stroke: SHELL_LINE, strokeAlpha: 0.28, radius: Object.freeze([24, 24, 0, 0]) }
    ])
  }),
  Object.freeze({
    key: 'prop_tx_body',
    zone: 'terminal-transmitter',
    art: `${ART_ROOT}/prop_tx_body.png`,
    x: 696, y: 360, w: 168, h: 96,
    parts: Object.freeze(deskParts(168, 96, 28))
  }),
  Object.freeze({
    key: 'prop_wall_receptacle',
    zone: 'terminal-transmitter',
    art: `${ART_ROOT}/prop_wall_receptacle.png`,
    x: 912, y: 378, w: 24, h: 30,
    parts: Object.freeze([{ x: 0, y: 0, w: 24, h: 30, fill: SHELL_DARK, stroke: SHELL_LINE, strokeAlpha: 0.28 }])
  }),
  Object.freeze({
    key: 'prop_rack_a',
    zone: 'model-infrastructure',
    art: `${ART_ROOT}/prop_rack.png`,
    x: 744, y: 144, w: 72, h: 120,
    parts: Object.freeze([{ x: 0, y: 0, w: 72, h: 120, fill: SHELL, stroke: SHELL_LINE, strokeAlpha: 0.28, shadow: 4 }])
  }),
  Object.freeze({
    key: 'prop_rack_b',
    zone: 'model-infrastructure',
    art: `${ART_ROOT}/prop_rack.png`,
    x: 840, y: 144, w: 72, h: 120,
    parts: Object.freeze([{ x: 0, y: 0, w: 72, h: 120, fill: SHELL, stroke: SHELL_LINE, strokeAlpha: 0.28, shadow: 4 }])
  }),
  Object.freeze({
    key: 'prop_furnace_chamber',
    zone: 'model-infrastructure',
    art: `${ART_ROOT}/prop_furnace_chamber.png`,
    x: 768, y: 288, w: 120, h: 72,
    parts: Object.freeze(deskParts(120, 72, 22))
  }),
  Object.freeze({
    key: 'prop_core_well',
    zone: 'power-core',
    art: `${ART_ROOT}/prop_core_well.png`,
    x: 408, y: 264, w: 144, h: 96,
    parts: Object.freeze([{ x: 0, y: 0, w: 144, h: 96, fill: COMMAND_CENTER_PALETTE.bg0, stroke: SHELL_TOP, strokeWidth: 2, recessed: true }])
  }),
  // Unzoned dressing: crates, wall sigil, cabling boxes.
  Object.freeze({
    key: 'prop_crate_small',
    zone: '',
    art: `${ART_ROOT}/prop_crate_small.png`,
    x: 300, y: 180, w: 24, h: 24,
    parts: Object.freeze([{ x: 0, y: 0, w: 24, h: 24, fill: SHELL_DARK, stroke: SHELL_LINE, strokeAlpha: 0.22 }])
  }),
  Object.freeze({
    key: 'prop_crate_wide_a',
    zone: '',
    art: `${ART_ROOT}/prop_crate_wide.png`,
    x: 648, y: 168, w: 48, h: 24,
    parts: Object.freeze([{ x: 0, y: 0, w: 48, h: 24, fill: SHELL_DARK, stroke: SHELL_LINE, strokeAlpha: 0.22 }])
  }),
  Object.freeze({
    key: 'prop_crate_wide_b',
    zone: '',
    art: `${ART_ROOT}/prop_crate_wide.png`,
    x: 624, y: 432, w: 48, h: 24,
    parts: Object.freeze([{ x: 0, y: 0, w: 48, h: 24, fill: SHELL_DARK, stroke: SHELL_LINE, strokeAlpha: 0.22 }])
  }),
  Object.freeze({
    key: 'prop_wall_sigil',
    zone: '',
    art: `${ART_ROOT}/prop_wall_sigil.png`,
    x: 612, y: 34, w: 52, h: 52,
    parts: Object.freeze([{ x: 0, y: 0, w: 52, h: 52, fill: 0x1c0627, stroke: COMMAND_CENTER_PALETTE.gold, strokeWidth: 2, strokeAlpha: 0.5, glyph: 'A' }])
  }),
  Object.freeze({
    key: 'prop_wall_vents',
    zone: '',
    art: `${ART_ROOT}/prop_wall_vents.png`,
    x: 724, y: 20, w: 216, h: 70,
    parts: Object.freeze([0, 76, 152].map((offset) => ({
      x: offset, y: 0, w: 64, h: 70, fill: SHELL_DARK, stroke: SHELL_TOP, strokeWidth: 2, taper: 0.14
    })))
  }),
  Object.freeze({
    key: 'prop_ops_cable_stub',
    zone: 'central-operations',
    art: `${ART_ROOT}/prop_ops_cable_stub.png`,
    x: 432, y: 132, w: 24, h: 8,
    parts: Object.freeze([{ x: 0, y: 0, w: 24, h: 8, fill: SHELL_TOP }])
  })
]);

// ---------------------------------------------------------------------------
// L3 · animated components (section 08). `kind` selects the renderer/loop; `ambient`
// runs always with a random phase offset, `operational` only on real telemetry.
// ---------------------------------------------------------------------------

export const COMMAND_CENTER_COMPONENTS = Object.freeze([
  Object.freeze({
    key: 'anim_ops_screens', zone: 'central-operations', kind: 'ops-crt',
    art: `${ART_ROOT}/anim_ops_screens.png`, frames: 4, fps: 6,
    x: 380, y: 32, w: 200, h: 68,
    color: COMMAND_CENTER_PALETTE.phosphor, screen: 0x031a17, bezel: 0x0e4a41,
    ambient: 'flicker', operational: 'readout'
  }),
  Object.freeze({
    key: 'anim_ops_desk_screens', zone: 'central-operations', kind: 'crt-row',
    art: `${ART_ROOT}/anim_ops_desk_screens.png`, frames: 4, fps: 6,
    x: 396, y: 150, w: 136, h: 26, cells: 3, cellWidth: 40, cellGap: 8,
    color: COMMAND_CENTER_PALETTE.phosphor, screen: 0x031a17, bezel: 0x0e4a41,
    ambient: 'flicker', operational: 'screens'
  }),
  Object.freeze({
    key: 'anim_keyboard_leds', zone: 'central-operations', kind: 'keyboard',
    art: `${ART_ROOT}/anim_keyboard_leds.png`, frames: 4, fps: 8,
    x: 396, y: 190, w: 136, h: 10,
    color: COMMAND_CENTER_PALETTE.cyan, ambient: 'idle', operational: 'type'
  }),
  Object.freeze({
    key: 'anim_ops_caret', zone: 'central-operations', kind: 'caret',
    art: `${ART_ROOT}/anim_ops_caret.png`, frames: 2, fps: 2,
    x: 540, y: 156, w: 28, h: 6,
    color: COMMAND_CENTER_PALETTE.cyan, ambient: 'blink'
  }),
  Object.freeze({
    key: 'anim_feed_cycle', zone: 'intelligence-research', kind: 'feed-bank',
    art: `${ART_ROOT}/anim_feed_cycle.png`, frames: 6, fps: 4,
    x: 52, y: 44, w: 224, h: 30, cells: 4, cellWidth: 44, cellGap: 16,
    color: COMMAND_CENTER_PALETTE.cyan, screen: 0x02181d, bezel: 0x0e4a41,
    ambient: 'scanline', operational: 'cycle'
  }),
  Object.freeze({
    key: 'anim_radar_sweep', zone: 'intelligence-research', kind: 'radar',
    art: `${ART_ROOT}/anim_radar_sweep.png`, frames: 8, fps: 12,
    x: 84, y: 176, w: 72, h: 72,
    color: COMMAND_CENTER_PALETTE.cyan, accent: COMMAND_CENTER_PALETTE.gold,
    ambient: 'blip', operational: 'sweep'
  }),
  Object.freeze({
    key: 'anim_scan_bar', zone: 'scanner-bench', kind: 'scan-bar',
    art: `${ART_ROOT}/anim_scan_bar.png`, frames: 8, fps: 12,
    x: 60, y: 280, w: 144, h: 16,
    color: COMMAND_CENTER_PALETTE.cyan, screen: 0x02181d, bezel: 0x0e4a41,
    operational: 'sweep'
  }),
  Object.freeze({
    key: 'anim_scan_lamp', zone: 'scanner-bench', kind: 'lamp',
    art: `${ART_ROOT}/anim_scan_lamp.png`, frames: 2, fps: 4,
    x: 60, y: 266, w: 6, h: 6,
    color: COMMAND_CENTER_PALETTE.phosphor, ambient: 'blink', operational: 'solid'
  }),
  Object.freeze({
    key: 'anim_code_scroll', zone: 'github-code', kind: 'code-crt',
    art: `${ART_ROOT}/anim_code_scroll.png`, frames: 8, fps: 6,
    x: 60, y: 400, w: 120, h: 34,
    color: COMMAND_CENTER_PALETTE.phosphor, screen: 0x021a0f, bezel: 0x0e4a2a,
    ambient: 'idle-text', operational: 'scroll'
  }),
  Object.freeze({
    key: 'anim_code_leds', zone: 'github-code', kind: 'led-stack',
    art: `${ART_ROOT}/anim_code_leds.png`, frames: 4, fps: 8,
    x: 190, y: 400, w: 18, h: 34, cells: 3,
    color: COMMAND_CENTER_PALETTE.phosphor, accent: COMMAND_CENTER_PALETTE.gold,
    ambient: 'blink'
  }),
  Object.freeze({
    key: 'anim_disk_reel', zone: 'github-code', kind: 'reel',
    art: `${ART_ROOT}/anim_disk_reel.png`, frames: 4, fps: 8,
    x: 234, y: 392, w: 24, h: 24,
    color: COMMAND_CENTER_PALETTE.line, ambient: 'spin'
  }),
  Object.freeze({
    key: 'anim_still_chamber', zone: 'newsletter', kind: 'chamber',
    art: `${ART_ROOT}/anim_still_chamber.png`, frames: 10, fps: 8,
    x: 276, y: 330, w: 48, h: 108,
    color: COMMAND_CENTER_PALETTE.brand, accent: COMMAND_CENTER_PALETTE.magenta,
    screen: 0x0d1b26, operational: 'fill'
  }),
  Object.freeze({
    key: 'anim_still_coil', zone: 'newsletter', kind: 'coil',
    art: `${ART_ROOT}/anim_still_coil.png`, frames: 6, fps: 10,
    x: 288, y: 350, w: 24, h: 24,
    color: COMMAND_CENTER_PALETTE.gold, operational: 'spin'
  }),
  Object.freeze({
    key: 'anim_tray_print', zone: 'newsletter', kind: 'tray',
    art: `${ART_ROOT}/anim_tray_print.png`, frames: 6, fps: 8,
    x: 354, y: 414, w: 48, h: 20,
    color: COMMAND_CENTER_PALETTE.cyan, screen: 0x02181d, bezel: 0x0e4a41,
    operational: 'print'
  }),
  Object.freeze({
    key: 'anim_x_crt', zone: 'x-communications', kind: 'x-crt',
    art: `${ART_ROOT}/anim_x_crt.png`, frames: 6, fps: 6,
    x: 468, y: 392, w: 64, h: 38,
    color: COMMAND_CENTER_PALETTE.magenta, screen: 0x1b0a24, bezel: COMMAND_CENTER_PALETTE.magenta,
    ambient: 'standby', operational: 'formatting'
  }),
  Object.freeze({
    key: 'anim_x_lamps', zone: 'x-communications', kind: 'lamp-grid',
    art: `${ART_ROOT}/anim_x_lamps.png`, frames: 4, fps: 6,
    x: 544, y: 392, w: 44, h: 38, cells: 4,
    color: COMMAND_CENTER_PALETTE.magenta, ambient: 'blink', operational: 'chase'
  }),
  Object.freeze({
    key: 'anim_x_dish', zone: 'x-communications', kind: 'dish',
    art: `${ART_ROOT}/anim_x_dish.png`, frames: 6, fps: 10,
    x: 596, y: 270, w: 8, h: 8,
    color: COMMAND_CENTER_PALETTE.magenta, operational: 'charge'
  }),
  Object.freeze({
    key: 'anim_tx_crt', zone: 'terminal-transmitter', kind: 'tx-crt',
    art: `${ART_ROOT}/anim_tx_crt.png`, frames: 6, fps: 6,
    x: 708, y: 372, w: 96, h: 60,
    color: COMMAND_CENTER_PALETTE.cyan, screen: 0x02181d, bezel: 0x0e4a41,
    ambient: 'standby', operational: 'link'
  }),
  Object.freeze({
    key: 'anim_tx_charge', zone: 'terminal-transmitter', kind: 'charge-orb',
    art: `${ART_ROOT}/anim_tx_charge.png`, frames: 8, fps: 10,
    x: 816, y: 378, w: 36, h: 36,
    color: COMMAND_CENTER_PALETTE.gold, operational: 'charge'
  }),
  Object.freeze({
    key: 'anim_tx_pilot', zone: 'terminal-transmitter', kind: 'lamp',
    art: `${ART_ROOT}/anim_tx_pilot.png`, frames: 2, fps: 4,
    x: 756, y: 336, w: 12, h: 12,
    color: COMMAND_CENTER_PALETTE.phosphor, ambient: 'blink'
  }),
  Object.freeze({
    key: 'anim_rack_leds', zone: 'model-infrastructure', kind: 'led-bank',
    art: `${ART_ROOT}/anim_rack_leds.png`, frames: 6, fps: 8,
    x: 752, y: 152, w: 56, h: 104, cells: 4,
    color: COMMAND_CENTER_PALETTE.phosphor, accent: COMMAND_CENTER_PALETTE.cyan,
    ambient: 'blink', operational: 'chase'
  }),
  Object.freeze({
    key: 'anim_fan', zone: 'model-infrastructure', kind: 'fan-stack',
    art: `${ART_ROOT}/anim_fan.png`, frames: 4, fps: 16,
    x: 848, y: 152, w: 56, h: 104, cells: 2,
    color: COMMAND_CENTER_PALETTE.line, ambient: 'spin', operational: 'spin-fast'
  }),
  Object.freeze({
    key: 'anim_furnace_heat', zone: 'model-infrastructure', kind: 'furnace',
    art: `${ART_ROOT}/anim_furnace_heat.png`, frames: 6, fps: 6,
    x: 780, y: 296, w: 96, h: 38,
    color: COMMAND_CENTER_PALETTE.gold, accent: COMMAND_CENTER_PALETTE.magenta,
    screen: 0x1b0a10, bezel: COMMAND_CENTER_PALETTE.warm,
    ambient: 'gauge', operational: 'heat'
  }),
  Object.freeze({
    key: 'anim_core_pulse', zone: 'power-core', kind: 'core',
    art: `${ART_ROOT}/anim_core_pulse.png`, frames: 8, fps: 6,
    x: 420, y: 276, w: 120, h: 72,
    color: COMMAND_CENTER_PALETTE.brand, accent: COMMAND_CENTER_PALETTE.cyan,
    ambient: 'pulse', operational: 'pulse-fast'
  }),
  Object.freeze({
    key: 'anim_core_sigil', zone: 'power-core', kind: 'sigil',
    art: `${ART_ROOT}/anim_core_sigil.png`, frames: 16, fps: 4,
    x: 456, y: 294, w: 48, h: 36,
    color: COMMAND_CENTER_PALETTE.gold, ambient: 'slow-rotate'
  }),
  Object.freeze({
    key: 'anim_core_seed', zone: 'power-core', kind: 'core-seed',
    art: `${ART_ROOT}/anim_core_seed.png`, frames: 1, fps: 1,
    x: 474, y: 306, w: 12, h: 12,
    color: COMMAND_CENTER_PALETTE.gold, ambient: 'glow'
  })
]);

// ---------------------------------------------------------------------------
// L6 · foreground / occlusion (section 08). Drawn above the character.
// ---------------------------------------------------------------------------

export const COMMAND_CENTER_FOREGROUND = Object.freeze([
  Object.freeze({ key: 'fore_ops_console_front', art: `${ART_ROOT}/fore_ops_console_front.png`, x: 384, y: 204, w: 192, h: 14 }),
  Object.freeze({ key: 'fore_code_bench_front', art: `${ART_ROOT}/fore_code_bench_front.png`, x: 48, y: 444, w: 168, h: 14 }),
  Object.freeze({ key: 'fore_still_base', art: `${ART_ROOT}/fore_still_base.png`, x: 264, y: 444, w: 72, h: 14 }),
  Object.freeze({ key: 'fore_x_console_front', art: `${ART_ROOT}/fore_x_console_front.png`, x: 456, y: 444, w: 144, h: 14 }),
  Object.freeze({ key: 'fore_tx_front', art: `${ART_ROOT}/fore_tx_front.png`, x: 696, y: 444, w: 168, h: 14 }),
  Object.freeze({ key: 'fore_furnace_lip', art: `${ART_ROOT}/fore_furnace_lip.png`, x: 768, y: 348, w: 120, h: 14 }),
  Object.freeze({ key: 'fore_pilaster_l', art: `${ART_ROOT}/fore_pilaster_l.png`, x: 0, y: 120, w: 24, h: 408, kind: 'pilaster-left' }),
  Object.freeze({ key: 'fore_pilaster_r', art: `${ART_ROOT}/fore_pilaster_r.png`, x: 936, y: 120, w: 24, h: 408, kind: 'pilaster-right' }),
  Object.freeze({ key: 'fore_wall_port', art: `${ART_ROOT}/fore_wall_port.png`, x: 912, y: 120, w: 24, h: 180, kind: 'wall-port' })
]);

// ---------------------------------------------------------------------------
// L5 · conduits and packet routes (section 05). One 8x8 packet sprite, five tints.
// ---------------------------------------------------------------------------

export const COMMAND_CENTER_CONDUITS = Object.freeze([
  Object.freeze({
    id: 'SP', label: 'spine', axis: 'h', x: 132, y: 246, length: 768, thickness: 6,
    direction: 1, color: COMMAND_CENTER_PALETTE.cyan, zone: '', idleTraffic: true,
    triggers: Object.freeze(['*'])
  }),
  Object.freeze({
    id: 'D1', label: 'intel bench → spine', axis: 'v', x: 129, y: 252, length: 60, thickness: 6,
    direction: -1, color: COMMAND_CENTER_PALETTE.cyan, zone: 'intelligence-research',
    triggers: Object.freeze(['researching', 'browsing', 'scanning'])
  }),
  Object.freeze({
    id: 'D2', label: 'spine → newsletter still', axis: 'v', x: 297, y: 252, length: 60, thickness: 6,
    direction: 1, color: COMMAND_CENTER_PALETTE.brand, zone: 'newsletter', handoff: true,
    triggers: Object.freeze(['newsletter', 'processing', 'writing'])
  }),
  Object.freeze({
    id: 'D3', label: 'ops console → core', axis: 'v', x: 477, y: 216, length: 48, thickness: 6,
    direction: 1, color: COMMAND_CENTER_PALETTE.gold, zone: 'power-core',
    triggers: Object.freeze(['evaluating', 'thinking'])
  }),
  Object.freeze({
    id: 'D4', label: 'spine → X console', axis: 'v', x: 525, y: 252, length: 132, thickness: 6,
    direction: 1, color: COMMAND_CENTER_PALETTE.magenta, zone: 'x-communications',
    triggers: Object.freeze(['writing', 'posting_to_x', 'publishing'])
  }),
  Object.freeze({
    id: 'D5', label: 'X mast → outside', axis: 'v', x: 596, y: 0, length: 276, thickness: 8,
    direction: -1, color: COMMAND_CENTER_PALETTE.magenta, zone: 'x-communications', beam: true,
    triggers: Object.freeze(['posting_to_x'])
  }),
  Object.freeze({
    id: 'D6', label: 'spine → terminal transmitter', axis: 'v', x: 777, y: 252, length: 108, thickness: 6,
    direction: 1, color: COMMAND_CENTER_PALETTE.gold, zone: 'terminal-transmitter', handoff: true,
    triggers: Object.freeze(['terminal_publish'])
  }),
  Object.freeze({
    id: 'D7', label: 'furnace → spine', axis: 'v', x: 825, y: 252, length: 36, thickness: 6,
    direction: -1, color: COMMAND_CENTER_PALETTE.gold, zone: 'model-infrastructure',
    triggers: Object.freeze(['processing', 'executing'])
  }),
  Object.freeze({
    id: 'D8', label: 'transmitter → wall port', axis: 'h', x: 864, y: 390, length: 72, thickness: 6,
    direction: 1, color: COMMAND_CENTER_PALETTE.gold, zone: 'terminal-transmitter',
    triggers: Object.freeze(['terminal_publish'])
  }),
  Object.freeze({
    id: 'D9', label: 'spine → code station', axis: 'v', x: 153, y: 252, length: 132, thickness: 6,
    direction: 1, color: COMMAND_CENTER_PALETTE.phosphor, zone: 'github-code',
    triggers: Object.freeze(['coding'])
  })
]);

// ---------------------------------------------------------------------------
// Walk graph (section 01): 4 lanes + 6 spurs, every segment axis-aligned so the
// hover rig only ever needs L/R + up/down translation, never a diagonal cel.
// ---------------------------------------------------------------------------

export const COMMAND_CENTER_WALK_GRAPH = Object.freeze({
  segments: Object.freeze([
    Object.freeze({ id: 'west-lane', from: Object.freeze({ x: 240, y: 132 }), to: Object.freeze({ x: 240, y: 496 }) }),
    Object.freeze({ id: 'south-lane', from: Object.freeze({ x: 240, y: 490 }), to: Object.freeze({ x: 900, y: 490 }) }),
    Object.freeze({ id: 'east-lane', from: Object.freeze({ x: 898, y: 300 }), to: Object.freeze({ x: 898, y: 492 }) }),
    Object.freeze({ id: 'centre-spur', from: Object.freeze({ x: 622, y: 228 }), to: Object.freeze({ x: 622, y: 492 }) }),
    Object.freeze({ id: 'ops-spur', from: Object.freeze({ x: 480, y: 228 }), to: Object.freeze({ x: 622, y: 228 }) }),
    Object.freeze({ id: 'res-spur', from: Object.freeze({ x: 132, y: 324 }), to: Object.freeze({ x: 240, y: 324 }) }),
    Object.freeze({ id: 'code-spur', from: Object.freeze({ x: 132, y: 468 }), to: Object.freeze({ x: 240, y: 468 }) }),
    Object.freeze({ id: 'furnace-spur', from: Object.freeze({ x: 828, y: 372 }), to: Object.freeze({ x: 898, y: 372 }) }),
    Object.freeze({ id: 'core-spur', from: Object.freeze({ x: 480, y: 372 }), to: Object.freeze({ x: 622, y: 372 }) }),
    Object.freeze({ id: 'newsletter-stub', from: Object.freeze({ x: 300, y: 480 }), to: Object.freeze({ x: 300, y: 490 }) }),
    Object.freeze({ id: 'x-stub', from: Object.freeze({ x: 528, y: 480 }), to: Object.freeze({ x: 528, y: 490 }) }),
    Object.freeze({ id: 'tx-stub', from: Object.freeze({ x: 780, y: 480 }), to: Object.freeze({ x: 780, y: 490 }) })
  ])
});

// ---------------------------------------------------------------------------
// Zones. Kept exported as COMMAND_CENTER_AREAS: the state model, the public state
// normalizer and the telemetry area aliases all address these by `id`.
// ---------------------------------------------------------------------------

export const COMMAND_CENTER_AREAS = Object.freeze([
  Object.freeze({
    id: 'central-operations', zoneNumber: '01',
    label: 'Central Operations', shortLabel: 'Ops',
    description: 'Ops console + wall CRT array',
    x: 480, y: 180,
    destination: Object.freeze({ x: 480, y: 228 }),
    bounds: Object.freeze({ x: 372, y: 24, width: 216, height: 192 }),
    hitRects: Object.freeze([
      Object.freeze({ x: 384, y: 144, width: 192, height: 72 }),
      Object.freeze({ x: 372, y: 24, width: 216, height: 84 })
    ]),
    color: COMMAND_CENTER_PALETTE.phosphor,
    accent: COMMAND_CENTER_PALETTE.gold,
    conduits: Object.freeze(['D3']),
    depth: 20
  }),
  Object.freeze({
    id: 'intelligence-research', zoneNumber: '02',
    label: 'AI Intelligence Array', shortLabel: 'Intel',
    description: 'Radar drum + wall feed bank',
    x: 120, y: 204,
    destination: Object.freeze({ x: 132, y: 324 }),
    bounds: Object.freeze({ x: 48, y: 40, width: 232, height: 200 }),
    hitRects: Object.freeze([
      Object.freeze({ x: 72, y: 168, width: 96, height: 72 }),
      Object.freeze({ x: 48, y: 40, width: 232, height: 38 })
    ]),
    color: COMMAND_CENTER_PALETTE.cyan,
    accent: COMMAND_CENTER_PALETTE.gold,
    conduits: Object.freeze(['D1']),
    depth: 20
  }),
  Object.freeze({
    id: 'scanner-bench', zoneNumber: '03',
    label: 'Scanner Bench', shortLabel: 'Scanner',
    description: 'New Tools / Agents / Playbooks',
    x: 132, y: 288,
    destination: Object.freeze({ x: 132, y: 324 }),
    bounds: Object.freeze({ x: 48, y: 264, width: 168, height: 48 }),
    hitRects: Object.freeze([Object.freeze({ x: 48, y: 264, width: 168, height: 48 })]),
    color: COMMAND_CENTER_PALETTE.cyan,
    accent: COMMAND_CENTER_PALETTE.phosphor,
    conduits: Object.freeze(['D1']),
    depth: 20
  }),
  Object.freeze({
    id: 'github-code', zoneNumber: '04',
    label: 'Code Station', shortLabel: 'Code',
    description: 'Green phosphor + disk tower',
    x: 132, y: 420,
    destination: Object.freeze({ x: 132, y: 468 }),
    bounds: Object.freeze({ x: 48, y: 384, width: 216, height: 72 }),
    hitRects: Object.freeze([
      Object.freeze({ x: 48, y: 384, width: 168, height: 72 }),
      Object.freeze({ x: 228, y: 384, width: 36, height: 72 })
    ]),
    color: COMMAND_CENTER_PALETTE.phosphor,
    accent: COMMAND_CENTER_PALETTE.gold,
    conduits: Object.freeze(['D9']),
    depth: 20
  }),
  Object.freeze({
    id: 'newsletter', zoneNumber: '05',
    label: 'Newsletter Still', shortLabel: 'Letter',
    description: 'Distillation column + tray',
    x: 300, y: 384,
    destination: Object.freeze({ x: 300, y: 480 }),
    bounds: Object.freeze({ x: 264, y: 312, width: 144, height: 144 }),
    hitRects: Object.freeze([
      Object.freeze({ x: 264, y: 312, width: 72, height: 144 }),
      Object.freeze({ x: 348, y: 408, width: 60, height: 48 })
    ]),
    color: COMMAND_CENTER_PALETTE.brand,
    accent: COMMAND_CENTER_PALETTE.magenta,
    conduits: Object.freeze(['D2']),
    depth: 20
  }),
  Object.freeze({
    id: 'x-communications', zoneNumber: '06',
    label: 'X Comms Uplink', shortLabel: 'X Comms',
    description: 'Console + mast + dish',
    x: 528, y: 396,
    destination: Object.freeze({ x: 528, y: 480 }),
    bounds: Object.freeze({ x: 456, y: 276, width: 168, height: 180 }),
    hitRects: Object.freeze([
      Object.freeze({ x: 456, y: 384, width: 144, height: 72 }),
      Object.freeze({ x: 576, y: 276, width: 48, height: 108 })
    ]),
    color: COMMAND_CENTER_PALETTE.magenta,
    accent: COMMAND_CENTER_PALETTE.cyan,
    conduits: Object.freeze(['D4', 'D5']),
    depth: 20
  }),
  Object.freeze({
    id: 'terminal-transmitter', zoneNumber: '07',
    label: 'Terminal Transmitter', shortLabel: 'Terminal',
    description: 'Large CRT + receptacle',
    x: 780, y: 408,
    destination: Object.freeze({ x: 780, y: 480 }),
    bounds: Object.freeze({ x: 696, y: 360, width: 168, height: 96 }),
    hitRects: Object.freeze([
      Object.freeze({ x: 696, y: 360, width: 168, height: 96 }),
      Object.freeze({ x: 912, y: 378, width: 24, height: 30 })
    ]),
    color: COMMAND_CENTER_PALETTE.cyan,
    accent: COMMAND_CENTER_PALETTE.gold,
    conduits: Object.freeze(['D6', 'D8']),
    depth: 20
  }),
  Object.freeze({
    id: 'model-infrastructure', zoneNumber: '08',
    label: 'Model Furnace', shortLabel: 'Models',
    description: '2 racks + processing chamber',
    x: 828, y: 240,
    destination: Object.freeze({ x: 828, y: 372 }),
    bounds: Object.freeze({ x: 744, y: 144, width: 168, height: 216 }),
    hitRects: Object.freeze([
      Object.freeze({ x: 744, y: 144, width: 72, height: 120 }),
      Object.freeze({ x: 840, y: 144, width: 72, height: 120 }),
      Object.freeze({ x: 768, y: 288, width: 120, height: 72 })
    ]),
    color: COMMAND_CENTER_PALETTE.gold,
    accent: COMMAND_CENTER_PALETTE.warm,
    conduits: Object.freeze(['D7']),
    depth: 20
  }),
  Object.freeze({
    id: 'power-core', zoneNumber: '09',
    label: 'Power Core', shortLabel: 'Core',
    description: 'Recessed well, always on',
    x: 480, y: 312,
    destination: Object.freeze({ x: 480, y: 372 }),
    bounds: Object.freeze({ x: 408, y: 264, width: 144, height: 96 }),
    hitRects: Object.freeze([Object.freeze({ x: 408, y: 264, width: 144, height: 96 })]),
    color: COMMAND_CENTER_PALETTE.brand,
    accent: COMMAND_CENTER_PALETTE.cyan,
    conduits: Object.freeze(['D3']),
    depth: 20
  })
]);

// Section 03: every anchor sits south of its machine, so one `operate` animation
// serves all eight working stations. Zone 09 is ambient-only and never attended.
export const COMMAND_CENTER_WORKFLOW_AREAS = Object.freeze({
  'ai-news': 'intelligence-research',
  'new-tools': 'scanner-bench',
  agents: 'scanner-bench',
  playbooks: 'scanner-bench',
  'creator-content': 'intelligence-research',
  monetization: 'intelligence-research',
  github: 'github-code',
  'models-infra': 'model-infrastructure',
  newsletter: 'newsletter',
  'social-x': 'x-communications',
  'terminal-publisher': 'terminal-transmitter'
});

export const COMMAND_CENTER_AREA_ALIASES = Object.freeze({
  home: 'central-operations',
  idle: 'central-operations',
  ops: 'central-operations',
  operations: 'central-operations',
  uplink: 'central-operations',
  servers: 'central-operations',
  research: 'intelligence-research',
  intel: 'intelligence-research',
  creator: 'intelligence-research',
  monetization: 'intelligence-research',
  'ai-news': 'intelligence-research',
  scanner: 'scanner-bench',
  bench: 'scanner-bench',
  playbooks: 'scanner-bench',
  'new-tools': 'scanner-bench',
  agents: 'scanner-bench',
  github: 'github-code',
  code: 'github-code',
  models: 'model-infrastructure',
  model: 'model-infrastructure',
  infra: 'model-infrastructure',
  furnace: 'model-infrastructure',
  'models-infra': 'model-infrastructure',
  newsletter: 'newsletter',
  letter: 'newsletter',
  still: 'newsletter',
  'social-x': 'x-communications',
  x: 'x-communications',
  'x-comms': 'x-communications',
  'x-communications': 'x-communications',
  comms: 'x-communications',
  terminal: 'terminal-transmitter',
  'terminal-publisher': 'terminal-transmitter',
  transmitter: 'terminal-transmitter',
  core: 'power-core',
  power: 'power-core'
});

export const COMMAND_CENTER_FALLBACK_AREA_ID = 'central-operations';
export const COMMAND_CENTER_FALLBACK_STATION_ID = COMMAND_CENTER_FALLBACK_AREA_ID;

const AREA_BY_ID = new Map(COMMAND_CENTER_AREAS.map((area) => [area.id, area]));

function cleanAreaToken(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]/g, '')
    .slice(0, 96);
}

export function canonicalAreaId(value) {
  const token = cleanAreaToken(value);
  if (!token) return '';
  if (AREA_BY_ID.has(token)) return token;
  return COMMAND_CENTER_AREA_ALIASES[token] || '';
}

export function areaById(areaId) {
  return AREA_BY_ID.get(areaId) || AREA_BY_ID.get(COMMAND_CENTER_FALLBACK_AREA_ID);
}

export function stationById(stationId) {
  return areaById(stationId);
}

export function areaIdForWorkflow(workflow) {
  const context = workflow && workflow.context;
  const contextArea = canonicalAreaId(context && (context.area || context.station));
  if (contextArea) return contextArea;

  const workflowId = cleanAreaToken(workflow && workflow.workflow);
  return COMMAND_CENTER_WORKFLOW_AREAS[workflowId] || COMMAND_CENTER_FALLBACK_AREA_ID;
}

export function stationIdForWorkflow(workflow) {
  return areaIdForWorkflow(workflow);
}

export function propsForZone(zoneId) {
  return COMMAND_CENTER_PROPS.filter((prop) => prop.zone === zoneId);
}

export function componentsForZone(zoneId) {
  return COMMAND_CENTER_COMPONENTS.filter((component) => component.zone === zoneId);
}

export function conduitsForZone(zoneId) {
  return COMMAND_CENTER_CONDUITS.filter((conduit) => conduit.zone === zoneId);
}
