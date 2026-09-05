// L4 · SpawnCamper9000 sprite sheets (section 03 / section 08).
//
// One entry per real exported sheet. Every entry carries its own measured
// dimensions — the scene never assumes a shared grid, so a Sprite Fusion export
// drops in at whatever frame size it actually shipped at. Adding a future
// animation (inspect · react · scan · error · publish · …) is a data edit here
// plus a filename in `public/assets/command-center/manifest.json`; no scene code
// changes, and nothing requires it to match an existing sheet's frame size or
// frame count.
//
// Two vocabularies meet in this file and must not be conflated:
//
//   logical mode    what telemetry means, from CAMPER_ANIMATIONS in
//                   visualMappings.mjs: idle · hover_travel_front ·
//                   hover_travel_back · operate · inspect · react. The inspector
//                   reports this, never an animation name.
//   visual anim     which sheet is on screen: idle · walk_front · walk_back ·
//                   walk_left · walk_right · operate_back.
//
// `camperStationaryVisualFor` is the only bridge between them, and the walk
// visuals are chosen from real movement instead (see `camperWalkVisualFor`).

const ART_ROOT = '/assets/command-center';

// Measured from the PNGs themselves, not from the design bible. Every sheet is
// one row of square cells, zero margin, zero spacing, RGBA8, non-interlaced,
// with strictly binary alpha (no semi-transparent pixels anywhere), so NEAREST
// sampling never interpolates an edge and the authored alpha is used exactly.
//
// Ground contact is the frame's bottom edge in every frame of all six sheets
// (worst case one row of slack), which is what lets `originY: 1` hold his feet
// on the anchor even though frame heights differ (108 / 110 / 113). Horizontal
// content centre never drifts more than ~1.2px from the cell centre, so
// `originX: 0.5` holds too. That is why no sheet needs an origin override — and
// why switching sheets produces no vertical hop.
export const CAMPER_SHEETS = Object.freeze([
  Object.freeze({
    anim: 'idle',
    key: 'spawncamper_idle',
    art: `${ART_ROOT}/spawncamper_idle_sheet.png`,
    purpose: 'Stationary at home or between jobs; the safe fallback for any mode without art.',
    sheetWidth: 864,
    sheetHeight: 108,
    frameWidth: 108,
    frameHeight: 108,
    frames: 8,
    // 8 frames at 8fps is a clean 1.000s breathing cycle.
    fps: 8,
    repeat: -1,
    originX: 0.5,
    originY: 1,
    // Integer only. Aspect ratio untouched, no setDisplaySize anywhere.
    scale: 1,
    // The art bakes no contact shadow, unlike the original 48x64 contract.
    bakedShadow: false
  }),
  Object.freeze({
    anim: 'walk_front',
    key: 'spawncamper_walk_front',
    art: `${ART_ROOT}/spawncamper_walk_front_sheet.png`,
    purpose: 'Travelling down the screen (positive Y), facing the camera.',
    sheetWidth: 864,
    sheetHeight: 108,
    frameWidth: 108,
    frameHeight: 108,
    frames: 8,
    // Preserve the authored 0.667s walking cycle; locomotion runs at 180px/s.
    fps: 12,
    repeat: -1,
    originX: 0.5,
    originY: 1,
    scale: 1,
    bakedShadow: false
  }),
  Object.freeze({
    anim: 'walk_back',
    key: 'spawncamper_walk_back',
    art: `${ART_ROOT}/spawncamper_walk_back_sheet.png`,
    purpose: 'Travelling up the screen (negative Y), back to the camera.',
    sheetWidth: 904,
    sheetHeight: 113,
    frameWidth: 113,
    frameHeight: 113,
    frames: 8,
    fps: 12,
    repeat: -1,
    originX: 0.5,
    originY: 1,
    scale: 1,
    bakedShadow: false
  }),
  Object.freeze({
    anim: 'walk_left',
    key: 'spawncamper_walk_left',
    art: `${ART_ROOT}/spawncamper_walk_left_sheet.png`,
    purpose: 'Travelling left (negative X), in profile.',
    sheetWidth: 880,
    sheetHeight: 110,
    frameWidth: 110,
    frameHeight: 110,
    frames: 8,
    fps: 12,
    repeat: -1,
    originX: 0.5,
    originY: 1,
    scale: 1,
    bakedShadow: false
  }),
  Object.freeze({
    anim: 'walk_right',
    key: 'spawncamper_walk_right',
    art: `${ART_ROOT}/spawncamper_walk_right_sheet.png`,
    purpose: 'Travelling right (positive X), in profile.',
    sheetWidth: 880,
    sheetHeight: 110,
    frameWidth: 110,
    frameHeight: 110,
    frames: 8,
    fps: 12,
    repeat: -1,
    originX: 0.5,
    originY: 1,
    scale: 1,
    bakedShadow: false,
    // This PNG was produced by mirroring the approved left sheet as one strip,
    // which mirrors the columns too: right[j] is pixel-identical to
    // mirror(left[7 - j]) — frames 1..6 byte-exact, and frames 0/7 differ only
    // in RGB underneath fully transparent pixels, so they render identically.
    // Playing it 0->7 would therefore run the approved cadence backwards in
    // time. Playing it back-to-front restores exactly the left cycle, facing
    // right. The PNG is never modified and no flipX is ever applied.
    frameOrder: Object.freeze([7, 6, 5, 4, 3, 2, 1, 0])
  }),
  Object.freeze({
    anim: 'operate_back',
    key: 'spawncamper_operate_back',
    art: `${ART_ROOT}/spawncamper_operate_back_sheet.png`,
    purpose: 'Stationary at a workstation, back to the camera, working the machine.',
    sheetWidth: 904,
    sheetHeight: 113,
    frameWidth: 113,
    frameHeight: 113,
    frames: 8,
    // 0.8s loop — purposeful at the machine, calmer than a walk.
    fps: 10,
    repeat: -1,
    originX: 0.5,
    originY: 1,
    scale: 1,
    bakedShadow: false
  })
]);

export const CAMPER_SHEET_FALLBACK_ANIM = 'idle';

const SHEET_BY_ANIM = new Map(CAMPER_SHEETS.map((sheet) => [sheet.anim, sheet]));

/**
 * The sheet that should render `anim` today: its own if it has been drawn,
 * otherwise the fallback. Returns null only when no character art exists at all,
 * which is the signal to keep the whitebox rig.
 */
export function camperSheetFor(anim) {
  return SHEET_BY_ANIM.get(anim)
    || SHEET_BY_ANIM.get(CAMPER_SHEET_FALLBACK_ANIM)
    || null;
}

/** Phaser animation key for a mode, resolved through the fallback. */
export function camperAnimationKeyFor(anim) {
  const sheet = camperSheetFor(anim);
  return sheet ? `camper_${sheet.anim}` : '';
}

/** Playback order for a sheet: its explicit `frameOrder`, else 0..frames-1. */
export function camperFrameOrderFor(sheet) {
  if (!sheet) return [];
  if (sheet.frameOrder) return [...sheet.frameOrder];
  return Array.from({ length: sheet.frames }, (_, index) => index);
}

/** The frame reduced motion holds for a sheet. */
export function camperStaticFrameFor(sheet) {
  if (!sheet) return 0;
  if (Number.isInteger(sheet.staticFrame)) return sheet.staticFrame;
  return camperFrameOrderFor(sheet)[0] ?? 0;
}

// Legacy logical mode -> stationary visual animation.
//
// SpawnCamper now visibly has mechanical legs, but the logical mode names in
// visualMappings.mjs predate the art and are deliberately left alone: renaming
// them repo-wide buys terminology and risks telemetry. This table is the whole
// bridge instead.
//
// `hover_travel_front` / `hover_travel_back` survive as the resting mode of
// `browsing` and `executing`. A resting mode is only ever applied once he has
// stopped at a station anchor — at home the scene always passes `idle` — and
// both are machine-oriented working states, so at rest they read as
// `operate_back`. They never select a walk animation: walking is chosen from
// real movement by `camperWalkVisualFor`, never from a mode name.
export const CAMPER_VISUAL_FOR_MODE = Object.freeze({
  idle: 'idle',
  hover_travel_front: 'operate_back',
  hover_travel_back: 'operate_back',
  operate: 'operate_back',
  // Researching, scanning, evaluating and thinking all ride `inspect`; every one
  // of them is stationary work at a machine.
  inspect: 'operate_back',
  // No react sheet has been drawn yet, so warning/error hold the safe fallback
  // rather than reverting to the primitive rig.
  react: 'idle'
});

/**
 * The visual animation for a logical mode while SpawnCamper is stationary.
 * Anything unmapped, or mapped to art that does not exist yet, resolves to the
 * idle fallback — never to the whitebox rig.
 */
export function camperStationaryVisualFor(mode) {
  const visual = CAMPER_VISUAL_FOR_MODE[mode] || CAMPER_SHEET_FALLBACK_ANIM;
  return SHEET_BY_ANIM.has(visual) ? visual : CAMPER_SHEET_FALLBACK_ANIM;
}

/**
 * The visual animation for a movement segment, from the delta actually being
 * travelled. The walk graph is axis-aligned so one of these is always zero; the
 * tie-break just has to be deterministic.
 *
 *   positive Y / down  -> walk_front      negative Y / up    -> walk_back
 *   negative X / left  -> walk_left       positive X / right -> walk_right
 */
export function camperWalkVisualFor(dx, dy) {
  const visual = Math.abs(dx) >= Math.abs(dy)
    ? (dx > 0 ? 'walk_right' : 'walk_left')
    : (dy > 0 ? 'walk_front' : 'walk_back');
  return SHEET_BY_ANIM.has(visual) ? visual : CAMPER_SHEET_FALLBACK_ANIM;
}

/**
 * The camper's animation state machine, kept out of the scene so it is pure and
 * directly testable: the scene owns sprites, this owns "what should be showing".
 *
 * Every mutator returns the visual that needs painting, or `null` when the
 * request resolves to the animation already playing. That is what stops a walk
 * cycle restarting at frame 0 on every tick or every leg of a straight route,
 * while still switching immediately the moment the answer genuinely changes.
 *
 * `mode` (logical telemetry) and `visual` (which sheet) are tracked separately
 * and never overwrite one another.
 */
export function createCamperVisuals() {
  let mode = '';
  let visual = '';
  let routeActive = false;

  const commit = (next) => {
    if (next === visual) return null;
    visual = next;
    return next;
  };

  return {
    get mode() { return mode; },
    get visual() { return visual; },
    get routeActive() { return routeActive; },

    /**
     * Record the logical telemetry mode. While a route is in flight the visual
     * belongs to the segment being walked, so the mode is remembered but not
     * painted — that is what keeps `operate_back` off the screen until he has
     * actually arrived at the machine.
     */
    setMode(next) {
      mode = next;
      if (routeActive) return null;
      return commit(camperStationaryVisualFor(next));
    },

    /** Hand the visual over to the route. */
    beginRoute() {
      routeActive = true;
    },

    /**
     * Give the visual back to the logical mode: arrival at a workstation, or a
     * route that never started. `operate_back` lands here.
     */
    endRoute(nextMode = mode) {
      routeActive = false;
      return this.setMode(nextMode);
    },

    /** The visual for the segment currently being traversed. */
    travel(dx, dy) {
      return commit(camperWalkVisualFor(dx, dy));
    }
  };
}
