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

import {
  areaIdForState,
  areaIdForWorkflow as areaIdForMachineWorkflow
} from './machineConfig.mjs';
export { COMMAND_CENTER_STATE_AREAS, COMMAND_CENTER_WORKFLOW_AREAS } from './machineConfig.mjs';

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
  key: 'env_floor_wall',
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
    Object.freeze({ x: 884, y: 414, text: '→ GA TERMINAL', color: COMMAND_CENTER_PALETTE.gold, alpha: 0.85 }),
    Object.freeze({ x: 10, y: 498, text: '← PUBLIC SITE', color: COMMAND_CENTER_PALETTE.line, alpha: 0.7 })
  ])
});

// ---------------------------------------------------------------------------
// L2 · machine geometry and whitebox bodies (section 08). This is the
// authoritative geometry for every machine: `x, y, w, h` is the box, and `parts`
// are the design's whitebox rects relative to it.
//
// Real art is NOT declared here. `src/command-center/propSheets.mjs` is the art
// registry; each of its entries names the prop key it covers and the scene
// anchors the file to this box (bottom-centre). Loading a machine's real asset
// suppresses the whitebox body below and its components in the next section.
//
// LAYOUT. Because art anchors bottom-centre, a shipped machine's rendered centre
// is `x + w/2` and its rendered FOOT is `y + h` — the box positions the art even
// when, as is usual, the art is nothing like the box's size. The floor is laid
// out on those rendered numbers, not on the boxes:
//
//   columns (art centre x)   132 · 316 · 480 (fixed) · 660 · 828
//   foot lines (art bottom)  264 back rank · 360 centre desk · 456 front rank
//
// Central Ops keeps its own wall-backed line at 216. Three pieces deliberately
// sit off the grid, each for a dimensional reason recorded where it stands: the
// Model Furnace (foot 336 — the Agent Lab cabinet caps its column at y180), the
// X Uplink (x480 — its D5 beam has to rise through bare wall), and the Profit
// Analyzer / Model Furnace pair, which clear each other by 18.5px because the
// east block cannot hold 133px and 165px of art side by side with a lane.
//
// The whitebox boxes are floor plans and are deliberately NOT the art's outline:
// the Tool Scanner's 104px art sits in a 168px box, the Publish Transmitter's 85px
// cabinet in a 168px box. Hit rects follow the box, so bare floor inside a zone
// still selects it. See the README for the full measured table.
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
    x: 372, y: 24, w: 216, h: 84,
    parts: Object.freeze([{ x: 0, y: 0, w: 216, h: 84, fill: SHELL_DARK, stroke: SHELL_TOP, strokeWidth: 2, inset: 0.2 }])
  }),
  Object.freeze({
    key: 'prop_ops_console',
    zone: 'central-operations',
    x: 384, y: 144, w: 192, h: 72,
    parts: Object.freeze(deskParts(192, 72, 20))
  }),
  Object.freeze({
    key: 'prop_wall_feed_shells',
    zone: 'intelligence-research',
    x: 48, y: 40, w: 232, h: 38,
    parts: Object.freeze([0, 60, 120, 180].map((offset) => ({
      x: offset, y: 0, w: 52, h: 38, fill: SHELL_DARK, stroke: SHELL_TOP, strokeWidth: 2
    })))
  }),
  Object.freeze({
    key: 'prop_radar_drum',
    zone: 'opportunity-radar',
    x: 612, y: 192, w: 96, h: 72,
    parts: Object.freeze([
      { x: 0, y: 22, w: 96, h: 50, fill: SHELL, stroke: SHELL_LINE, strokeAlpha: 0.28, shadow: 4 },
      { x: 0, y: 0, w: 96, h: 24, fill: SHELL_TOP, stroke: SHELL_LINE, strokeAlpha: 0.28, radius: Object.freeze([48, 48, 0, 0]) }
    ])
  }),
  Object.freeze({
    key: 'prop_scanner_bench',
    zone: 'scanner-bench',
    x: 232, y: 216, w: 168, h: 48,
    parts: Object.freeze(deskParts(168, 48, 16))
  }),
  Object.freeze({
    key: 'prop_code_bench',
    zone: 'github-code',
    x: 48, y: 384, w: 168, h: 72,
    parts: Object.freeze(deskParts(168, 72, 22))
  }),
  Object.freeze({
    key: 'prop_disk_tower',
    zone: 'github-code',
    x: 228, y: 384, w: 36, h: 72,
    parts: Object.freeze([{ x: 0, y: 0, w: 36, h: 72, fill: SHELL_DARK, stroke: SHELL_LINE, strokeAlpha: 0.28, shadow: 4 }])
  }),
  Object.freeze({
    key: 'prop_still_column',
    zone: 'newsletter',
    x: 280, y: 312, w: 72, h: 144,
    parts: Object.freeze([
      { x: 6, y: 0, w: 60, h: 144, fill: SHELL, stroke: SHELL_LINE, strokeAlpha: 0.28, radius: Object.freeze([30, 30, 4, 4]), shadow: 4 },
      { x: 0, y: 36, w: 72, h: 8, fill: SHELL_TOP },
      { x: 0, y: 104, w: 72, h: 8, fill: SHELL_TOP }
    ])
  }),
  Object.freeze({
    key: 'prop_still_tray',
    zone: 'newsletter',
    x: 364, y: 408, w: 60, h: 48,
    parts: Object.freeze([{ x: 0, y: 0, w: 60, h: 48, fill: SHELL, stroke: SHELL_LINE, strokeAlpha: 0.28, shadow: 4 }])
  }),
  Object.freeze({
    key: 'prop_x_console',
    zone: 'x-communications',
    x: 408, y: 422, w: 144, h: 72,
    parts: Object.freeze(deskParts(144, 72, 22))
  }),
  Object.freeze({
    key: 'prop_x_mast',
    zone: 'x-communications',
    x: 528, y: 314, w: 48, h: 108,
    parts: Object.freeze([
      { x: 12, y: 12, w: 24, h: 96, fill: SHELL, stroke: SHELL_LINE, strokeAlpha: 0.28 },
      { x: 0, y: 0, w: 48, h: 14, fill: SHELL_TOP, stroke: SHELL_LINE, strokeAlpha: 0.28, radius: Object.freeze([24, 24, 0, 0]) }
    ])
  }),
  Object.freeze({
    key: 'prop_tx_body',
    zone: 'terminal-transmitter',
    x: 744, y: 360, w: 168, h: 96,
    parts: Object.freeze(deskParts(168, 96, 28))
  }),
  Object.freeze({
    key: 'prop_rack_a',
    zone: 'model-infrastructure',
    x: 744, y: 120, w: 72, h: 120,
    parts: Object.freeze([{ x: 0, y: 0, w: 72, h: 120, fill: SHELL, stroke: SHELL_LINE, strokeAlpha: 0.28, shadow: 4 }])
  }),
  Object.freeze({
    key: 'prop_rack_b',
    zone: 'model-infrastructure',
    x: 840, y: 120, w: 72, h: 120,
    parts: Object.freeze([{ x: 0, y: 0, w: 72, h: 120, fill: SHELL, stroke: SHELL_LINE, strokeAlpha: 0.28, shadow: 4 }])
  }),
  Object.freeze({
    key: 'prop_furnace_chamber',
    zone: 'model-infrastructure',
    x: 768, y: 264, w: 120, h: 72,
    parts: Object.freeze(deskParts(120, 72, 22))
  }),
  // Zone 09. This 144x96 pocket in the middle of the room was the Power Core's
  // recessed well: scenery with no Hermes job behind it, holding the best floor
  // pocket in the facility while three real machines shared one bench across the
  // room. The Power Core is retired outright and the Experiment Bench moved in as
  // the sole workflow machine here — same box, same walk anchor, same zone number.
  Object.freeze({
    key: 'prop_experiment_bench',
    zone: 'experiment-bench',
    x: 408, y: 264, w: 144, h: 96,
    parts: Object.freeze(deskParts(144, 96, 24))
  }),
  // Zone 10 and 11. Creator Console and Profit Analyzer used to hang off
  // `prop_wall_feed_shells` alongside News Array — three unrelated workflow
  // machines on one 232x38 wall strip. Production art is one sprite per machine,
  // so each now owns a floor-standing console box of its own.
  //
  // The layout normalization pass then moved both into the mid-east column at
  // centre x660: the Creator Console onto the back rank (art y 155-264) and the
  // Profit Analyzer onto the front rank (art y 295-456). The Profit Analyzer's
  // art is 133x161 against a 108x72 box, and at its old 636,240 it overlapped the
  // Model Furnace's art by 11.5x75px — the collision the pass existed to fix.
  // The two now share a column and clear each other by 96px vertically.
  Object.freeze({
    key: 'prop_creator_console',
    zone: 'creator-console',
    x: 72, y: 192, w: 120, h: 72,
    parts: Object.freeze(deskParts(120, 72, 22))
  }),
  Object.freeze({
    key: 'prop_profit_analyzer',
    zone: 'profit-analyzer',
    x: 606, y: 384, w: 108, h: 72,
    parts: Object.freeze(deskParts(108, 72, 22))
  }),
  // Zone 12. Agent Lab shared `prop_scanner_bench` with Tool Scanner — two
  // unrelated workflow machines on one 168x48 bench, the last shared anchor left
  // in the room. Its production art is a tall wall cabinet, so it took a slot in
  // the upper-right vent bank; that bank was cosmetic whitebox dressing with no
  // Hermes job behind it and has since been deleted outright, so the cabinet now
  // hangs on bare wall art. The box is the art's own 92x160 footprint rather than
  // a floor plan — nothing stands on the floor here, so there is no footprint to
  // plan. After the layout normalization pass it clears the Profit Analyzer art
  // (which now ends at x 726.5, in the mid-east column) by 60px and the Model
  // Furnace art (which now starts at y 213) by 33px. The Model Furnace and the
  // Publish Transmitter stand in the column beneath it, so the floor pocket that
  // used to sit here is gone.
  Object.freeze({
    key: 'prop_wall_agent_lab',
    zone: 'agent-lab',
    x: 786, y: 20, w: 92, h: 160,
    parts: Object.freeze([
      { x: 0, y: 0, w: 92, h: 160, fill: SHELL_DARK, stroke: SHELL_TOP, strokeWidth: 2 },
      { x: 22, y: 44, w: 48, h: 82, fill: SHELL, stroke: SHELL_LINE, strokeAlpha: 0.28 }
    ])
  }),
  // Unzoned dressing. The wall sigil is the only piece left: it is the gold
  // Alchemists emblem, and its art has shipped. Everything else here was whitebox
  // filler and was deleted in the cleanup pass — `prop_crate_small` (24x24 @
  // 300,180) with art pass 2, then `prop_crate_wide_a` (48x24 @ 648,168),
  // `prop_crate_wide_b` (48x24 @ 624,432) and the three-louvre `prop_wall_vents`
  // bank (216x70 @ 724,20). Each went from `COMMAND_CENTER_PROPS` and from
  // `propSheets.mjs` together: a box present in one but not the other fails the
  // every-prop-is-described invariant in either direction.
  //
  // The one prop in the room with NO whitebox parts, and the only one entitled to
  // none. Its whitebox was a 52x52 slab filled 0x1c0627, stroked gold, with a
  // `Russo One` "A" drawn over it — a stand-in for a glyph nobody had drawn yet.
  // The emblem is now a finished transparent PNG, so there is nothing to fall back
  // *to*: a dark plate behind transparent art is not a fallback, it is a plate
  // behind the art. The box itself stays because it is the anchor `covers[0]`
  // resolves to — the art registry holds no coordinates by design — but it draws
  // nothing on its own, and `part.glyph` went out of the scene with the slab, the
  // way `part.taper` went out with the vent bank.
  Object.freeze({
    key: 'prop_wall_sigil',
    zone: '',
    x: 612, y: 34, w: 52, h: 52,
    parts: Object.freeze([])
  })
]);

// ---------------------------------------------------------------------------
// L3 · whitebox machine components (section 08). `kind` selects the renderer/
// loop; `ambient` runs always with a random phase offset, `operational` only on
// real telemetry.
//
// These are the DEVELOPMENT FALLBACK, not an art contract. The superseded
// design-bible workflow shipped each of these as its own small `anim_*.png`
// overlay bolted onto a static prop; production art is now a single complete
// object per machine (see propSheets.mjs), so a machine's real asset — static or
// animated — retires every component listed in its `coversComponents`. Nothing
// here is ever painted on top of finished art.
// ---------------------------------------------------------------------------

export const COMMAND_CENTER_COMPONENTS = Object.freeze([
  Object.freeze({
    key: 'anim_ops_screens', zone: 'central-operations', kind: 'ops-crt',
    x: 380, y: 32, w: 200, h: 68,
    color: COMMAND_CENTER_PALETTE.phosphor, screen: 0x031a17, bezel: 0x0e4a41,
    ambient: 'flicker', operational: 'readout'
  }),
  Object.freeze({
    key: 'anim_ops_desk_screens', zone: 'central-operations', kind: 'crt-row',
    x: 396, y: 150, w: 136, h: 26, cells: 3, cellWidth: 40, cellGap: 8,
    color: COMMAND_CENTER_PALETTE.phosphor, screen: 0x031a17, bezel: 0x0e4a41,
    ambient: 'flicker', operational: 'screens'
  }),
  Object.freeze({
    key: 'anim_keyboard_leds', zone: 'central-operations', kind: 'keyboard',
    x: 396, y: 190, w: 136, h: 10,
    color: COMMAND_CENTER_PALETTE.cyan, ambient: 'idle', operational: 'type'
  }),
  Object.freeze({
    key: 'anim_ops_caret', zone: 'central-operations', kind: 'caret',
    x: 540, y: 156, w: 28, h: 6,
    color: COMMAND_CENTER_PALETTE.cyan, ambient: 'blink'
  }),
  Object.freeze({
    key: 'anim_feed_cycle', zone: 'intelligence-research', kind: 'feed-bank',
    x: 52, y: 44, w: 224, h: 30, cells: 4, cellWidth: 44, cellGap: 16,
    color: COMMAND_CENTER_PALETTE.cyan, screen: 0x02181d, bezel: 0x0e4a41,
    ambient: 'scanline', operational: 'cycle'
  }),
  Object.freeze({
    key: 'anim_radar_sweep', zone: 'opportunity-radar', kind: 'radar',
    x: 624, y: 200, w: 72, h: 72,
    color: COMMAND_CENTER_PALETTE.cyan, accent: COMMAND_CENTER_PALETTE.gold,
    ambient: 'blip', operational: 'sweep'
  }),
  Object.freeze({
    key: 'anim_scan_bar', zone: 'scanner-bench', kind: 'scan-bar',
    x: 244, y: 232, w: 144, h: 16,
    color: COMMAND_CENTER_PALETTE.cyan, screen: 0x02181d, bezel: 0x0e4a41,
    operational: 'sweep'
  }),
  Object.freeze({
    key: 'anim_scan_lamp', zone: 'scanner-bench', kind: 'lamp',
    x: 244, y: 218, w: 6, h: 6,
    color: COMMAND_CENTER_PALETTE.phosphor, ambient: 'blink', operational: 'solid'
  }),
  Object.freeze({
    key: 'anim_code_scroll', zone: 'github-code', kind: 'code-crt',
    x: 60, y: 400, w: 120, h: 34,
    color: COMMAND_CENTER_PALETTE.phosphor, screen: 0x021a0f, bezel: 0x0e4a2a,
    ambient: 'idle-text', operational: 'scroll'
  }),
  Object.freeze({
    key: 'anim_code_leds', zone: 'github-code', kind: 'led-stack',
    x: 190, y: 400, w: 18, h: 34, cells: 3,
    color: COMMAND_CENTER_PALETTE.phosphor, accent: COMMAND_CENTER_PALETTE.gold,
    ambient: 'blink'
  }),
  Object.freeze({
    key: 'anim_disk_reel', zone: 'github-code', kind: 'reel',
    x: 234, y: 392, w: 24, h: 24,
    color: COMMAND_CENTER_PALETTE.line, ambient: 'spin'
  }),
  Object.freeze({
    key: 'anim_still_chamber', zone: 'newsletter', kind: 'chamber',
    x: 292, y: 330, w: 48, h: 108,
    color: COMMAND_CENTER_PALETTE.brand, accent: COMMAND_CENTER_PALETTE.magenta,
    screen: 0x0d1b26, operational: 'fill'
  }),
  Object.freeze({
    key: 'anim_still_coil', zone: 'newsletter', kind: 'coil',
    x: 304, y: 350, w: 24, h: 24,
    color: COMMAND_CENTER_PALETTE.gold, operational: 'spin'
  }),
  Object.freeze({
    key: 'anim_tray_print', zone: 'newsletter', kind: 'tray',
    x: 370, y: 414, w: 48, h: 20,
    color: COMMAND_CENTER_PALETTE.cyan, screen: 0x02181d, bezel: 0x0e4a41,
    operational: 'print'
  }),
  Object.freeze({
    key: 'anim_x_crt', zone: 'x-communications', kind: 'x-crt',
    x: 420, y: 430, w: 64, h: 38,
    color: COMMAND_CENTER_PALETTE.magenta, screen: 0x1b0a24, bezel: COMMAND_CENTER_PALETTE.magenta,
    ambient: 'standby', operational: 'formatting'
  }),
  Object.freeze({
    key: 'anim_x_lamps', zone: 'x-communications', kind: 'lamp-grid',
    x: 496, y: 430, w: 44, h: 38, cells: 4,
    color: COMMAND_CENTER_PALETTE.magenta, ambient: 'blink', operational: 'chase'
  }),
  Object.freeze({
    key: 'anim_x_dish', zone: 'x-communications', kind: 'dish',
    x: 548, y: 308, w: 8, h: 8,
    color: COMMAND_CENTER_PALETTE.magenta, operational: 'charge'
  }),
  Object.freeze({
    key: 'anim_tx_crt', zone: 'terminal-transmitter', kind: 'tx-crt',
    x: 756, y: 372, w: 96, h: 60,
    color: COMMAND_CENTER_PALETTE.cyan, screen: 0x02181d, bezel: 0x0e4a41,
    ambient: 'standby', operational: 'link'
  }),
  Object.freeze({
    key: 'anim_tx_charge', zone: 'terminal-transmitter', kind: 'charge-orb',
    x: 864, y: 378, w: 36, h: 36,
    color: COMMAND_CENTER_PALETTE.gold, operational: 'charge'
  }),
  Object.freeze({
    key: 'anim_tx_pilot', zone: 'terminal-transmitter', kind: 'lamp',
    x: 804, y: 336, w: 12, h: 12,
    color: COMMAND_CENTER_PALETTE.phosphor, ambient: 'blink'
  }),
  Object.freeze({
    key: 'anim_rack_leds', zone: 'model-infrastructure', kind: 'led-bank',
    x: 752, y: 128, w: 56, h: 104, cells: 4,
    color: COMMAND_CENTER_PALETTE.phosphor, accent: COMMAND_CENTER_PALETTE.cyan,
    ambient: 'blink', operational: 'chase'
  }),
  Object.freeze({
    key: 'anim_fan', zone: 'model-infrastructure', kind: 'fan-stack',
    x: 848, y: 128, w: 56, h: 104, cells: 2,
    color: COMMAND_CENTER_PALETTE.line, ambient: 'spin', operational: 'spin-fast'
  }),
  Object.freeze({
    key: 'anim_furnace_heat', zone: 'model-infrastructure', kind: 'furnace',
    x: 780, y: 272, w: 96, h: 38,
    color: COMMAND_CENTER_PALETTE.gold, accent: COMMAND_CENTER_PALETTE.magenta,
    screen: 0x1b0a10, bezel: COMMAND_CENTER_PALETTE.warm,
    ambient: 'gauge', operational: 'heat'
  }),
  // The Power Core's three components — core pulse, slow sigil, seed glow — were
  // deleted with the Power Core itself. The Experiment Bench that took its pocket
  // ships as one full-object sheet, so it declares no whitebox components at all.
  Object.freeze({
    key: 'anim_creator_screens', zone: 'creator-console', kind: 'crt-row',
    x: 84, y: 202, w: 96, h: 26, cells: 3, cellWidth: 28, cellGap: 6,
    color: COMMAND_CENTER_PALETTE.cyan, screen: 0x02181d, bezel: 0x0e4a41,
    ambient: 'flicker', operational: 'screens'
  }),
  Object.freeze({
    key: 'anim_profit_screens', zone: 'profit-analyzer', kind: 'crt-row',
    x: 618, y: 394, w: 84, h: 26, cells: 3, cellWidth: 24, cellGap: 6,
    color: COMMAND_CENTER_PALETTE.gold, screen: 0x1b1405, bezel: 0x4a3a0e,
    ambient: 'flicker', operational: 'screens'
  })
]);

// ---------------------------------------------------------------------------
// L6 · foreground / occlusion (section 08). Drawn above the character.
//
// Independent of the prop art registry and deliberately so: a foreground piece
// carries its own `art` path and its own loader seam, and is not the old
// component-overlay system. The seam stays; the registry is empty.
//
// The machine lips went first: a lip existed to hide the camper's legs behind a
// whitebox desk, and a finished machine already draws its own front, so keeping
// one only paints a flat block over real art. `fore_code_bench_front`,
// `fore_furnace_lip`, `fore_still_base`, `fore_tx_front`, `fore_x_console_front`
// and finally `fore_ops_console_front` all went with their machines' art.
//
// The three STRUCTURAL pieces went the same way, for the same reason, one layer
// down: `fore_pilaster_l` (0,120 24x408), `fore_pilaster_r` (936,120 24x408) and
// `fore_wall_port` (912,120 24x180). None of them ever had a PNG, so each could
// only render as its procedural whitebox — two dark gradient strips and a solid
// 0x1c0627 slab — painted at DEPTH.fore over the finished env_floor_wall.png,
// which draws its own wall edges and cable port. They were structural while L1
// was a whitebox and had nothing left to occlude once it shipped. An untextured
// occluder over finished art is a block, not an occluder: that rule retired the
// lips and it retires these. None of the three is an art deliverable any more.
//
// Do not reinstate a piece here without a real PNG behind it.
// ---------------------------------------------------------------------------

export const COMMAND_CENTER_FOREGROUND = Object.freeze([]);

// ---------------------------------------------------------------------------
// L5 · conduits and packet routes (section 05). One 8x8 packet sprite, five tints.
// ---------------------------------------------------------------------------

export const COMMAND_CENTER_CONDUITS = Object.freeze([
  Object.freeze({
    id: 'SP', label: 'spine', axis: 'h', x: 108, y: 288, length: 792, thickness: 6,
    direction: 1, color: COMMAND_CENTER_PALETTE.cyan, zone: '', idleTraffic: true,
    triggers: Object.freeze(['*'])
  }),
  Object.freeze({
    id: 'D1', label: 'news array → spine', axis: 'v', x: 164, y: 78, length: 210, thickness: 6,
    direction: 1, color: COMMAND_CENTER_PALETTE.cyan, zone: 'intelligence-research',
    triggers: Object.freeze(['researching', 'browsing', 'scanning'])
  }),
  Object.freeze({
    id: 'D2', label: 'spine → newsletter still', axis: 'v', x: 316, y: 294, length: 18, thickness: 6,
    direction: 1, color: COMMAND_CENTER_PALETTE.brand, zone: 'newsletter', handoff: true,
    triggers: Object.freeze(['newsletter', 'processing', 'writing'])
  }),
  Object.freeze({
    id: 'D3', label: 'ops console → experiment bench', axis: 'v', x: 477, y: 216, length: 54, thickness: 6,
    direction: 1, color: COMMAND_CENTER_PALETTE.gold, zone: 'experiment-bench',
    triggers: Object.freeze(['evaluating', 'thinking'])
  }),
  Object.freeze({
    id: 'D4', label: 'spine → X console', axis: 'v', x: 477, y: 294, length: 137, thickness: 6,
    direction: 1, color: COMMAND_CENTER_PALETTE.magenta, zone: 'x-communications',
    triggers: Object.freeze(['writing', 'posting_to_x', 'publishing'])
  }),
  Object.freeze({
    id: 'D5', label: 'X uplink emission', axis: 'v', x: 502, y: 383, length: 48, thickness: 8,
    direction: -1, color: COMMAND_CENTER_PALETTE.magenta, zone: 'x-communications', beam: true,
    triggers: Object.freeze(['posting_to_x'])
  }),
  Object.freeze({
    id: 'D6', label: 'spine → terminal transmitter', axis: 'v', x: 828, y: 294, length: 82, thickness: 6,
    direction: 1, color: COMMAND_CENTER_PALETTE.gold, zone: 'terminal-transmitter', handoff: true,
    triggers: Object.freeze(['terminal_publish'])
  }),
  Object.freeze({
    id: 'D7', label: 'furnace → spine', axis: 'v', x: 810, y: 294, length: 42, thickness: 6,
    direction: -1, color: COMMAND_CENTER_PALETTE.gold, zone: 'model-infrastructure',
    triggers: Object.freeze(['processing', 'executing'])
  }),
  Object.freeze({
    id: 'D8', label: 'transmitter → wall port', axis: 'h', x: 870, y: 416, length: 66, thickness: 6,
    direction: 1, color: COMMAND_CENTER_PALETTE.gold, zone: 'terminal-transmitter',
    triggers: Object.freeze(['terminal_publish'])
  }),
  Object.freeze({
    id: 'D9', label: 'spine → code station', axis: 'v', x: 132, y: 294, length: 17, thickness: 6,
    direction: 1, color: COMMAND_CENTER_PALETTE.phosphor, zone: 'github-code',
    triggers: Object.freeze(['coding'])
  })
]);

// ---------------------------------------------------------------------------
// Walk graph (section 01): 4 lanes + 8 spurs, every segment axis-aligned so the
// hover rig only ever needs L/R + up/down translation, never a diagonal cel.
// ---------------------------------------------------------------------------

// Foot-space corridors, validated against station ground footprints and the
// union of every directional foot envelope. Side-wall pockets are not aisles.
export const COMMAND_CENTER_WALK_GRAPH = Object.freeze({
  segments: Object.freeze([
    // The replacement scanner and Creator Console leave no 82px-wide foot
    // corridor between their lower footprints. Route around that shared band
    // through centre-spur/north-spur instead of cutting through their art.
    Object.freeze({ id: 'west-lane', from: Object.freeze({ x: 241, y: 180 }), to: Object.freeze({ x: 241, y: 228 }) }),
    Object.freeze({ id: 'west-lane-lower', from: Object.freeze({ x: 241, y: 272 }), to: Object.freeze({ x: 241, y: 384 }) }),
    Object.freeze({ id: 'south-lane-west', from: Object.freeze({ x: 132, y: 490 }), to: Object.freeze({ x: 365, y: 490 }) }),
    Object.freeze({ id: 'south-lane-east', from: Object.freeze({ x: 595, y: 490 }), to: Object.freeze({ x: 828, y: 490 }) }),
    // The wider native Radar sheet reaches x616 at its floor footprint. The
    // centre spur detours left through x575 only for that footprint band, then
    // returns to x588 so it also clears the Experiment Bench footprint below.
    Object.freeze({ id: 'centre-spur', from: Object.freeze({ x: 588, y: 276 }), to: Object.freeze({ x: 588, y: 384 }) }),
    Object.freeze({ id: 'centre-spur-north', from: Object.freeze({ x: 588, y: 228 }), to: Object.freeze({ x: 588, y: 240 }) }),
    Object.freeze({ id: 'radar-clearance-west', from: Object.freeze({ x: 588, y: 240 }), to: Object.freeze({ x: 575, y: 240 }) }),
    Object.freeze({ id: 'radar-clearance', from: Object.freeze({ x: 575, y: 240 }), to: Object.freeze({ x: 575, y: 276 }) }),
    Object.freeze({ id: 'radar-clearance-east', from: Object.freeze({ x: 575, y: 276 }), to: Object.freeze({ x: 588, y: 276 }) }),
    Object.freeze({ id: 'ops-spur', from: Object.freeze({ x: 241, y: 228 }), to: Object.freeze({ x: 588, y: 228 }) }),
    Object.freeze({ id: 'scanner-clearance', from: Object.freeze({ x: 409, y: 228 }), to: Object.freeze({ x: 409, y: 276 }) }),
    Object.freeze({ id: 'north-spur', from: Object.freeze({ x: 132, y: 276 }), to: Object.freeze({ x: 588, y: 276 }) }),
    Object.freeze({ id: 'code-spur', from: Object.freeze({ x: 132, y: 468 }), to: Object.freeze({ x: 132, y: 490 }) }),
    Object.freeze({ id: 'furnace-spur', from: Object.freeze({ x: 700, y: 348 }), to: Object.freeze({ x: 828, y: 348 }) }),
    Object.freeze({ id: 'bench-spur', from: Object.freeze({ x: 480, y: 372 }), to: Object.freeze({ x: 588, y: 372 }) }),
    Object.freeze({ id: 'newsletter-stub', from: Object.freeze({ x: 316, y: 468 }), to: Object.freeze({ x: 316, y: 490 }) }),
    Object.freeze({ id: 'x-clearance-west', from: Object.freeze({ x: 365, y: 490 }), to: Object.freeze({ x: 365, y: 468 }) }),
    Object.freeze({ id: 'x-clearance-top', from: Object.freeze({ x: 365, y: 468 }), to: Object.freeze({ x: 595, y: 468 }) }),
    Object.freeze({ id: 'x-clearance-east', from: Object.freeze({ x: 595, y: 468 }), to: Object.freeze({ x: 595, y: 502 }) }),
    Object.freeze({ id: 'x-stub', from: Object.freeze({ x: 595, y: 502 }), to: Object.freeze({ x: 480, y: 502 }) }),
    Object.freeze({ id: 'tx-stub', from: Object.freeze({ x: 828, y: 468 }), to: Object.freeze({ x: 828, y: 490 }) }),
    Object.freeze({ id: 'radar-spur', from: Object.freeze({ x: 588, y: 276 }), to: Object.freeze({ x: 660, y: 276 }) }),
    Object.freeze({ id: 'profit-stub', from: Object.freeze({ x: 660, y: 468 }), to: Object.freeze({ x: 660, y: 490 }) }),
    Object.freeze({ id: 'agent-spur', from: Object.freeze({ x: 740, y: 192 }), to: Object.freeze({ x: 832, y: 192 }) }),
    Object.freeze({ id: 'intel-stub', from: Object.freeze({ x: 164, y: 180 }), to: Object.freeze({ x: 241, y: 180 }) }),
    Object.freeze({ id: 'cross-aisle', from: Object.freeze({ x: 241, y: 384 }), to: Object.freeze({ x: 700, y: 384 }) }),
    Object.freeze({ id: 'south-access', from: Object.freeze({ x: 410, y: 384 }), to: Object.freeze({ x: 410, y: 468 }) }),
    Object.freeze({ id: 'east-access', from: Object.freeze({ x: 700, y: 300 }), to: Object.freeze({ x: 700, y: 384 }) }),
    Object.freeze({ id: 'east-crossing', from: Object.freeze({ x: 588, y: 300 }), to: Object.freeze({ x: 746, y: 300 }) }),
    Object.freeze({ id: 'agent-clearance', from: Object.freeze({ x: 740, y: 192 }), to: Object.freeze({ x: 746, y: 192 }) }),
    Object.freeze({ id: 'agent-access', from: Object.freeze({ x: 746, y: 192 }), to: Object.freeze({ x: 746, y: 300 }) }),
    Object.freeze({ id: 'back-aisle', from: Object.freeze({ x: 241, y: 180 }), to: Object.freeze({ x: 740, y: 180 }) }),
    Object.freeze({ id: 'agent-north', from: Object.freeze({ x: 740, y: 180 }), to: Object.freeze({ x: 740, y: 192 }) })
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
    // The Opportunity Radar drum was carved out of this zone into zone 13 when the
    // two machines swapped columns: one zone cannot own a wall strip at x48-280 and
    // a drum at x633-687 with a single bounds box, hit area and walk anchor. Zone 02
    // is the News Array's wall display alone now. Its id, label, aliases, conduit and
    // the ai-news workflow and researching/browsing states that resolve here are all
    // untouched — only the drum left.
    description: 'Wall feed bank',
    x: 164, y: 78,
    // The shipped wall base ends at y160; y180 leaves room for his feet.
    destination: Object.freeze({ x: 164, y: 180 }),
    bounds: Object.freeze({ x: 48, y: 40, width: 232, height: 38 }),
    hitRects: Object.freeze([
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
    description: 'New Tools',
    x: 316, y: 240,
    destination: Object.freeze({ x: 316, y: 276 }),
    bounds: Object.freeze({ x: 232, y: 216, width: 168, height: 48 }),
    hitRects: Object.freeze([Object.freeze({ x: 232, y: 216, width: 168, height: 48 })]),
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
    x: 316, y: 384,
    // Foot 456 + 12. It stood at 480 — on the south lane, 24px out — after the still
    // moved to the front rank without its anchor.
    destination: Object.freeze({ x: 316, y: 468 }),
    bounds: Object.freeze({ x: 280, y: 312, width: 144, height: 144 }),
    hitRects: Object.freeze([
      Object.freeze({ x: 280, y: 312, width: 72, height: 144 }),
      Object.freeze({ x: 364, y: 408, width: 60, height: 48 })
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
    x: 480, y: 458,
    // The relocated console box ends at y494. The replacement cell carries 36px
    // of slack under the art, so its drawn pixels land at y494 and the camper's
    // lowest clear front position is y502.
    destination: Object.freeze({ x: 480, y: 502 }),
    bounds: Object.freeze({ x: 408, y: 314, width: 168, height: 180 }),
    hitRects: Object.freeze([
      Object.freeze({ x: 408, y: 422, width: 144, height: 72 }),
      Object.freeze({ x: 528, y: 314, width: 48, height: 108 })
    ]),
    color: COMMAND_CENTER_PALETTE.magenta,
    accent: COMMAND_CENTER_PALETTE.cyan,
    conduits: Object.freeze(['D4', 'D5']),
    depth: 20
  }),
  Object.freeze({
    id: 'terminal-transmitter', zoneNumber: '07',
    label: 'Terminal Transmitter', shortLabel: 'Terminal',
    description: 'Publish transmitter cabinet',
    x: 828, y: 408,
    // Foot 456 + 12, level with the Newsletter Still, the X Uplink, the Repo Forge
    // and the Profit Analyzer: every front-rank console is worked from y468 now.
    destination: Object.freeze({ x: 828, y: 468 }),
    bounds: Object.freeze({ x: 744, y: 360, width: 168, height: 96 }),
    // One rect, not two: the 24x30 wall receptacle at 912,378 was blank whitebox
    // dressing and is deleted. The cabinet is the whole of zone 07.
    hitRects: Object.freeze([Object.freeze({ x: 744, y: 360, width: 168, height: 96 })]),
    color: COMMAND_CENTER_PALETTE.cyan,
    accent: COMMAND_CENTER_PALETTE.gold,
    conduits: Object.freeze(['D6', 'D8']),
    depth: 20
  }),
  Object.freeze({
    id: 'model-infrastructure', zoneNumber: '08',
    label: 'Model Furnace', shortLabel: 'Models',
    description: '2 racks + processing chamber',
    x: 828, y: 216,
    destination: Object.freeze({ x: 828, y: 348 }),
    bounds: Object.freeze({ x: 744, y: 120, width: 168, height: 216 }),
    hitRects: Object.freeze([
      Object.freeze({ x: 744, y: 120, width: 72, height: 120 }),
      Object.freeze({ x: 840, y: 120, width: 72, height: 120 }),
      Object.freeze({ x: 768, y: 264, width: 120, height: 72 })
    ]),
    color: COMMAND_CENTER_PALETTE.gold,
    accent: COMMAND_CENTER_PALETTE.warm,
    conduits: Object.freeze(['D7']),
    depth: 20
  }),
  Object.freeze({
    id: 'experiment-bench', zoneNumber: '09',
    label: 'Experiment Bench', shortLabel: 'Bench',
    description: 'Playbooks and repeatable experiments',
    x: 480, y: 312,
    destination: Object.freeze({ x: 480, y: 372 }),
    bounds: Object.freeze({ x: 408, y: 264, width: 144, height: 96 }),
    hitRects: Object.freeze([Object.freeze({ x: 408, y: 264, width: 144, height: 96 })]),
    color: COMMAND_CENTER_PALETTE.brand,
    accent: COMMAND_CENTER_PALETTE.gold,
    conduits: Object.freeze(['D3']),
    depth: 20
  }),
  // Zones 10 and 11 exist because a walk destination is per-zone, not per-machine:
  // while Creator Console and Profit Analyzer lived in zone 02 the camper walked to
  // the intel bench for them, which was across the room from where they stand. Both
  // moved again in the layout normalization pass — into the mid-east column, back
  // rank and front rank — so their destinations are (660, 276) and (660, 468), one
  // off `creator-spur` and one off `profit-stub`. Their workflow keys, Hermes jobs
  // and telemetry state names are untouched throughout: only which zone the machine
  // physically occupies, and where that zone sits, has ever moved.
  Object.freeze({
    id: 'creator-console', zoneNumber: '10',
    label: 'Creator Console', shortLabel: 'Creator',
    description: 'Creator-facing intelligence console',
    x: 132, y: 228,
    destination: Object.freeze({ x: 132, y: 276 }),
    bounds: Object.freeze({ x: 72, y: 192, width: 120, height: 72 }),
    hitRects: Object.freeze([Object.freeze({ x: 72, y: 192, width: 120, height: 72 })]),
    color: COMMAND_CENTER_PALETTE.cyan,
    accent: COMMAND_CENTER_PALETTE.magenta,
    conduits: Object.freeze([]),
    depth: 20
  }),
  Object.freeze({
    id: 'profit-analyzer', zoneNumber: '11',
    label: 'Profit Analyzer', shortLabel: 'Profit',
    description: 'Monetization and partner opportunity console',
    x: 660, y: 420,
    destination: Object.freeze({ x: 660, y: 468 }),
    bounds: Object.freeze({ x: 606, y: 384, width: 108, height: 72 }),
    hitRects: Object.freeze([Object.freeze({ x: 606, y: 384, width: 108, height: 72 })]),
    color: COMMAND_CENTER_PALETTE.gold,
    accent: COMMAND_CENTER_PALETTE.phosphor,
    conduits: Object.freeze([]),
    depth: 20
  }),
  // Zone 12. Agent Lab had no zone of its own: `agents` resolved to zone 03 and
  // the camper walked to the scanner bench across the room for it. Workflow key,
  // Hermes job and telemetry state names are untouched — only which zone the
  // machine physically occupies moved. Wall-mounted, so the anchor is the art's
  // footprint and the destination is the floor 12px below it, the same offset
  // every floor console uses.
  Object.freeze({
    id: 'agent-lab', zoneNumber: '12',
    label: 'Agent Lab', shortLabel: 'Agents',
    description: 'Wall-mounted agent incubation chamber',
    x: 832, y: 100,
    destination: Object.freeze({ x: 832, y: 192 }),
    bounds: Object.freeze({ x: 786, y: 20, width: 92, height: 160 }),
    hitRects: Object.freeze([Object.freeze({ x: 786, y: 20, width: 92, height: 160 })]),
    color: COMMAND_CENTER_PALETTE.cyan,
    accent: COMMAND_CENTER_PALETTE.brand,
    conduits: Object.freeze([]),
    depth: 20
  }),
  // Zone 13. The Opportunity Radar rode in zone 02 as a passenger, sharing the News
  // Array's bounds box, hit area and walk anchor because both stood in the same
  // corner. Swapping it with the Creator Console put the drum at x660 and the wall
  // display stayed at x48-280, and one zone cannot span that: the bounds box would
  // run x48-720, the label would hang over empty floor, and a single anchor cannot
  // stand in front of both. So the drum was carved out, exactly as the Creator
  // Console, Profit Analyzer and Agent Lab were before it.
  //
  // Its Hermes job (254525fa846f / Opportunity Scout), its deliberately empty
  // workflow list and its prop are all untouched — only which zone it occupies moved.
  // It declares no conduit because it drives no workflow lane, so this zone stays
  // idle unless that Hermes job actually fires, which was already true of the machine.
  //
  // No new walk segment: (660, 276) is already the far end of `radar-spur`, the
  // segment built for the Creator Console when it held this slot.
  Object.freeze({
    id: 'opportunity-radar', zoneNumber: '13',
    label: 'Opportunity Radar', shortLabel: 'Radar',
    description: 'Opportunity scouting drum',
    x: 660, y: 228,
    destination: Object.freeze({ x: 660, y: 276 }),
    bounds: Object.freeze({ x: 612, y: 192, width: 96, height: 72 }),
    hitRects: Object.freeze([Object.freeze({ x: 612, y: 192, width: 96, height: 72 })]),
    color: COMMAND_CENTER_PALETTE.cyan,
    accent: COMMAND_CENTER_PALETTE.gold,
    conduits: Object.freeze([]),
    depth: 20
  })
]);

export const COMMAND_CENTER_AREA_ALIASES = Object.freeze({
  home: 'central-operations',
  idle: 'central-operations',
  ops: 'central-operations',
  operations: 'central-operations',
  uplink: 'central-operations',
  servers: 'central-operations',
  research: 'intelligence-research',
  intel: 'intelligence-research',
  radar: 'opportunity-radar',
  opportunity: 'opportunity-radar',
  'opportunity-radar': 'opportunity-radar',
  'opportunity-scout': 'opportunity-radar',
  creator: 'creator-console',
  'creator-content': 'creator-console',
  'creator-console': 'creator-console',
  monetization: 'profit-analyzer',
  profit: 'profit-analyzer',
  'profit-analyzer': 'profit-analyzer',
  'ai-news': 'intelligence-research',
  scanner: 'scanner-bench',
  bench: 'scanner-bench',
  playbooks: 'experiment-bench',
  experiment: 'experiment-bench',
  'new-tools': 'scanner-bench',
  agents: 'agent-lab',
  'agent-lab': 'agent-lab',
  lab: 'agent-lab',
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
  transmitter: 'terminal-transmitter'
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

/**
 * Where SpawnCamper stands for one telemetry entry, in three steps:
 *
 *   1. `context.station` — an explicit per-event override. Optional, and the only
 *      thing that outranks the activity, because a sender that names a station
 *      knows something the state alone cannot say.
 *   2. the activity `state` — the normal path. The work moved, so he moves.
 *   3. the workflow's own machine — the fallback, and the answer for every state
 *      that names no activity (idle, waiting, complete, warning, error).
 *
 * Callers that pass no `state` get exactly the behaviour they had before step 2
 * existed, which is why the whitebox and the machine-mapping tests are unaffected.
 */
export function areaIdForWorkflow(workflow) {
  const context = workflow && workflow.context;
  const contextArea = canonicalAreaId(context && (context.area || context.station));
  if (contextArea) return contextArea;

  const stateArea = areaIdForState(workflow && workflow.state);
  if (stateArea) return stateArea;

  return areaIdForMachineWorkflow(workflow) || COMMAND_CENTER_FALLBACK_AREA_ID;
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
