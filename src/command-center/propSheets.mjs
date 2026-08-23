// L2/L3 · room prop art registry (section 08).
//
// Two production asset types, and nothing else:
//
//   static      one transparent PNG that IS the complete object.
//               prop_<name>.png
//   animated    one sprite sheet where EVERY FRAME contains the complete
//               object, including whatever moves.
//               anim_<name>_sheet.png
//
// An animated sheet *is* the machine: there is no static body underneath it and
// no separate animated overlay above it. The superseded contract (a static prop
// plus hand-extracted `anim_radar_sweep` / `anim_still_coil` / `anim_x_crt`
// component overlays) is gone — the production pipeline is Sprite Fusion, which
// animates the whole source object, and manually isolating sweeps, CRT regions,
// LED clusters, coils and fans is work nobody needs to do.
//
// Adding art is a data edit here plus a filename in
// `public/assets/command-center/manifest.json`. Turning a machine from static
// into animated is a one-entry edit: change `type`, point `art` at the sheet,
// and record the frame geometry measured off the real PNG. No scene code moves.
//
// Two vocabularies meet here and must not be conflated:
//
//   whitebox    the procedural development fallback in sceneConfig.mjs —
//               COMMAND_CENTER_PROPS bodies and COMMAND_CENTER_COMPONENTS
//               screens/LEDs/sweeps. It owns the authoritative geometry.
//   art         the real exported file, described by this registry. It carries
//               no coordinates at all: `covers[0]` names the whitebox box the
//               scene anchors it to.
//
// A real asset is a complete machine, so loading one suppresses BOTH the
// whitebox body it `covers` AND every whitebox component in
// `coversComponents`. Procedural screens are never painted over finished art.

const ART_ROOT = '/assets/command-center';

export const PROP_STATIC = 'static';
export const PROP_ANIMATED = 'animated';

// Seeded from the paths sceneConfig already declared. The manifest is the gate:
// seven machines ship real animated sheets today (Opportunity Radar, Tool
// Scanner, Newsletter Still, X Uplink, Creator Console, Repo Forge, Model
// Furnace) and render as finished art; every other entry names a file the
// manifest does not list, makes zero requests, and keeps its whitebox.
//
// `id`         unique instance. Two instances may share one `textureKey`
//              (both wide crates) — the file is fetched once.
// `textureKey` the Phaser texture key.
// `covers`     whitebox prop keys this asset replaces. covers[0] is the anchor.
// `coversComponents`
//              whitebox component keys this machine no longer needs.
//
// Animated entries additionally carry measured `sheetWidth` / `sheetHeight` /
// `frameWidth` / `frameHeight` / `frames` / `fps` / `repeat`, and may override
// `frameOrder` and `staticFrame`. Any entry may override `offsetX` / `offsetY` /
// `originX` / `originY` / `scale` for an awkward export.
//
// Three more knobs, all optional, all data:
//
// `flipX`      render the art mirrored. The PNG is never touched — a Sprite
//              Fusion export that reads the wrong way round is turned around
//              here, not re-exported and not mirrored on disk. Only safe
//              because the sheets are horizontally centred in their cell, so
//              mirroring happens about the machine's own centre and the floor
//              contact point does not move. Machine art only — the character
//              registry ships a sheet that is already physically mirrored on
//              disk and must never be flipped a second time, which is why that
//              registry has no knob like this one.
// `shadowWidth`
//              the art's real opaque width, measured off the PNG, used to size
//              the generated contact shadow. Needed because the whitebox box a
//              machine anchors on is a floor-plan footprint, not the art's:
//              the Tool Scanner's 68px bench sits in a 168px box, and the Model
//              Furnace's 165px assembly anchors on a 120px chamber.
// `groundShadow`
//              `false` for wall-mounted art, which stands on nothing and must
//              not pool a shadow on the floor below it.
export const PROP_SHEETS = Object.freeze([
  Object.freeze({
    id: 'wall_crt_bank',
    type: PROP_STATIC,
    art: `${ART_ROOT}/prop_wall_crt_bank.png`,
    textureKey: 'prop_wall_crt_bank',
    groundShadow: false,
    covers: Object.freeze(['prop_wall_crt_bank']),
    coversComponents: Object.freeze(['anim_ops_screens'])
  }),
  Object.freeze({
    id: 'ops_console',
    type: PROP_STATIC,
    art: `${ART_ROOT}/prop_ops_console.png`,
    textureKey: 'prop_ops_console',
    covers: Object.freeze(['prop_ops_console']),
    coversComponents: Object.freeze(['anim_ops_desk_screens', 'anim_keyboard_leds', 'anim_ops_caret'])
  }),
  Object.freeze({
    id: 'wall_feed_shells',
    type: PROP_STATIC,
    art: `${ART_ROOT}/prop_wall_feed_shells.png`,
    textureKey: 'prop_wall_feed_shells',
    groundShadow: false,
    covers: Object.freeze(['prop_wall_feed_shells']),
    coversComponents: Object.freeze(['anim_feed_cycle'])
  }),
  // Opportunity Radar (zone 02). The sheet is the whole terminal — cabinet, bezel
  // and the sweep that used to be `anim_radar_sweep` — so no static body loads
  // underneath it. 8 frames at 8fps is one 1.000s revolution.
  Object.freeze({
    id: 'radar_drum',
    type: PROP_ANIMATED,
    art: `${ART_ROOT}/anim_opportunity_radar_sheet.png`,
    textureKey: 'anim_opportunity_radar',
    sheetWidth: 544,
    sheetHeight: 68,
    frameWidth: 68,
    frameHeight: 68,
    frames: 8,
    fps: 8,
    repeat: -1,
    shadowWidth: 54,
    covers: Object.freeze(['prop_radar_drum']),
    coversComponents: Object.freeze(['anim_radar_sweep'])
  }),
  // Tool Scanner (zone 03). Bench, dish and status lamps are one object, so the
  // whitebox scan bar and ready lamp retire with the body. 6fps is one 1.333s
  // dish rotation — ambient reads as powered, not busy.
  Object.freeze({
    id: 'scanner_bench',
    type: PROP_ANIMATED,
    art: `${ART_ROOT}/anim_tool_scanner_sheet.png`,
    textureKey: 'anim_tool_scanner',
    sheetWidth: 576,
    sheetHeight: 72,
    frameWidth: 72,
    frameHeight: 72,
    frames: 8,
    fps: 6,
    repeat: -1,
    shadowWidth: 68,
    covers: Object.freeze(['prop_scanner_bench']),
    coversComponents: Object.freeze(['anim_scan_bar', 'anim_scan_lamp'])
  }),
  // Repo Forge (zone 04). The sheet is the whole workstation — bench, phosphor
  // terminal and the disk tower beside it all animate in frame — so one entry
  // owns both whitebox bodies, `prop_code_bench` (the anchor) and
  // `prop_disk_tower`, plus all three of their components. As with the X Uplink
  // mast there is deliberately no second `disk_tower` entry: a prop claimed
  // twice breaks the one-machine-one-owner rule. The 203x202 cell keeps 29 empty
  // rows under the bench feet, so `offsetY` puts them back on the floor line.
  // 6fps is one 1.333s ambient cycle.
  Object.freeze({
    id: 'code_bench',
    type: PROP_ANIMATED,
    art: `${ART_ROOT}/anim_repo_forge_sheet.png`,
    textureKey: 'anim_repo_forge',
    sheetWidth: 1624,
    sheetHeight: 202,
    frameWidth: 203,
    frameHeight: 202,
    frames: 8,
    fps: 6,
    repeat: -1,
    offsetY: 29,
    flipX: true,
    shadowWidth: 163,
    covers: Object.freeze(['prop_code_bench', 'prop_disk_tower']),
    coversComponents: Object.freeze(['anim_code_scroll', 'anim_code_leds', 'anim_disk_reel'])
  }),
  // Newsletter Still (zone 05). One machine for both newsletter stages — `09
  // Daily Newsletter` and `09b Newsletter Finisher` — and one sheet for the
  // whole of it: chamber, liquid, coil, gauge, lamps and the lower output tray
  // all move in frame, so both whitebox bodies and all three components retire
  // together. As with the X Uplink there is deliberately no second `still_tray`
  // entry — a prop claimed twice breaks the one-machine-one-owner rule. 6fps is
  // one 1.333s distillation cycle. `offsetY` is the only kind of override any
  // entry in this registry carries: the Sprite Fusion cell keeps 21 empty rows
  // under the base plate, and without it the machine would float that far off
  // its floor contact point.
  Object.freeze({
    id: 'still_column',
    type: PROP_ANIMATED,
    art: `${ART_ROOT}/anim_newsletter_still_sheet.png`,
    textureKey: 'anim_newsletter_still',
    sheetWidth: 1624,
    sheetHeight: 203,
    frameWidth: 203,
    frameHeight: 203,
    frames: 8,
    fps: 6,
    repeat: -1,
    offsetY: 21,
    shadowWidth: 98,
    covers: Object.freeze(['prop_still_column', 'prop_still_tray']),
    coversComponents: Object.freeze(['anim_still_chamber', 'anim_still_coil', 'anim_tray_print'])
  }),
  // X Uplink (zone 06). This export bakes the antenna mast into the console, so
  // one entry owns both whitebox bodies — `prop_x_console` (the anchor) and
  // `prop_x_mast` — plus all three of their components. There is deliberately no
  // separate `x_mast` entry any more: a prop claimed by two entries would break
  // the one-machine-one-owner invariant. 6fps is one 1.333s CRT cycle.
  Object.freeze({
    id: 'x_console',
    type: PROP_ANIMATED,
    art: `${ART_ROOT}/anim_x_uplink_sheet.png`,
    textureKey: 'anim_x_uplink',
    sheetWidth: 512,
    sheetHeight: 64,
    frameWidth: 64,
    frameHeight: 64,
    frames: 8,
    fps: 6,
    repeat: -1,
    shadowWidth: 60,
    covers: Object.freeze(['prop_x_console', 'prop_x_mast']),
    coversComponents: Object.freeze(['anim_x_crt', 'anim_x_lamps', 'anim_x_dish'])
  }),
  Object.freeze({
    id: 'tx_body',
    type: PROP_STATIC,
    art: `${ART_ROOT}/prop_tx_body.png`,
    textureKey: 'prop_tx_body',
    covers: Object.freeze(['prop_tx_body']),
    coversComponents: Object.freeze(['anim_tx_crt', 'anim_tx_charge', 'anim_tx_pilot'])
  }),
  Object.freeze({
    id: 'wall_receptacle',
    type: PROP_STATIC,
    art: `${ART_ROOT}/prop_wall_receptacle.png`,
    textureKey: 'prop_wall_receptacle',
    groundShadow: false,
    covers: Object.freeze(['prop_wall_receptacle']),
    coversComponents: Object.freeze([])
  }),
  // Model Furnace (zone 08). The sheet is the complete assembly — chamber, heat
  // gauge and both flanking racks with their LEDs and fans — so one entry owns
  // all three whitebox bodies and all three of their components. The anchor is
  // `prop_furnace_chamber`, not a rack: the assembly's floor contact is the
  // chamber's bottom edge, and anchoring on a rack would hang it 96px high.
  // There are deliberately no `rack_a` / `rack_b` entries any more, so the old
  // one-file-two-instances pairing now lives only on the wide crates. The
  // 202x203 cell keeps 41 empty rows under the chamber base. 6fps is one 1.333s
  // ambient cycle.
  Object.freeze({
    id: 'furnace_chamber',
    type: PROP_ANIMATED,
    art: `${ART_ROOT}/anim_model_furnace_sheet.png`,
    textureKey: 'anim_model_furnace',
    sheetWidth: 1616,
    sheetHeight: 203,
    frameWidth: 202,
    frameHeight: 203,
    frames: 8,
    fps: 6,
    repeat: -1,
    offsetY: 41,
    shadowWidth: 165,
    covers: Object.freeze(['prop_furnace_chamber', 'prop_rack_a', 'prop_rack_b']),
    coversComponents: Object.freeze(['anim_furnace_heat', 'anim_rack_leds', 'anim_fan'])
  }),
  Object.freeze({
    id: 'core_well',
    type: PROP_STATIC,
    art: `${ART_ROOT}/prop_core_well.png`,
    textureKey: 'prop_core_well',
    covers: Object.freeze(['prop_core_well']),
    coversComponents: Object.freeze(['anim_core_pulse', 'anim_core_sigil', 'anim_core_seed'])
  }),
  // Creator Console (zone 10). Split off `prop_wall_feed_shells`, which three
  // unrelated machines shared, onto a floor console of its own during the
  // geometry pass, and now shipping as one full-object sheet: cabinet, the
  // three-cell editorial CRT row and its signal traffic all move in frame, so
  // the whitebox screens retire with the body. The 165x151 cell keeps 22 empty
  // rows under the plinth. 6fps is one 1.333s ambient cycle.
  Object.freeze({
    id: 'creator_console',
    type: PROP_ANIMATED,
    art: `${ART_ROOT}/anim_creator_console_sheet.png`,
    textureKey: 'anim_creator_console',
    sheetWidth: 1320,
    sheetHeight: 151,
    frameWidth: 165,
    frameHeight: 151,
    frames: 8,
    fps: 6,
    repeat: -1,
    offsetY: 22,
    flipX: true,
    shadowWidth: 123,
    covers: Object.freeze(['prop_creator_console']),
    coversComponents: Object.freeze(['anim_creator_screens'])
  }),
  // Profit Analyzer (zone 11) was split off the same wall strip but its file does
  // not exist yet and is not listed in the manifest, so it makes zero requests
  // and keeps its whitebox.
  Object.freeze({
    id: 'profit_analyzer',
    type: PROP_STATIC,
    art: `${ART_ROOT}/prop_profit_analyzer.png`,
    textureKey: 'prop_profit_analyzer',
    covers: Object.freeze(['prop_profit_analyzer']),
    coversComponents: Object.freeze(['anim_profit_screens'])
  }),
  // Unzoned dressing: no machine components of their own. The small crate that
  // used to sit at 300,180 is gone — the Creator Console art footprint swallowed
  // it whole. Both wide crates are one file at two anchors: one fetch, two
  // instances.
  Object.freeze({
    id: 'crate_wide_a',
    type: PROP_STATIC,
    art: `${ART_ROOT}/prop_crate_wide.png`,
    textureKey: 'prop_crate_wide',
    covers: Object.freeze(['prop_crate_wide_a']),
    coversComponents: Object.freeze([])
  }),
  Object.freeze({
    id: 'crate_wide_b',
    type: PROP_STATIC,
    art: `${ART_ROOT}/prop_crate_wide.png`,
    textureKey: 'prop_crate_wide',
    covers: Object.freeze(['prop_crate_wide_b']),
    coversComponents: Object.freeze([])
  }),
  Object.freeze({
    id: 'wall_sigil',
    type: PROP_STATIC,
    art: `${ART_ROOT}/prop_wall_sigil.png`,
    textureKey: 'prop_wall_sigil',
    groundShadow: false,
    covers: Object.freeze(['prop_wall_sigil']),
    coversComponents: Object.freeze([])
  }),
  Object.freeze({
    id: 'wall_vents',
    type: PROP_STATIC,
    art: `${ART_ROOT}/prop_wall_vents.png`,
    textureKey: 'prop_wall_vents',
    groundShadow: false,
    covers: Object.freeze(['prop_wall_vents']),
    coversComponents: Object.freeze([])
  }),
  Object.freeze({
    id: 'ops_cable_stub',
    type: PROP_STATIC,
    art: `${ART_ROOT}/prop_ops_cable_stub.png`,
    textureKey: 'prop_ops_cable_stub',
    covers: Object.freeze(['prop_ops_cable_stub']),
    coversComponents: Object.freeze([])
  })
]);

const SHEET_BY_ID = new Map(PROP_SHEETS.map((entry) => [entry.id, entry]));

/** The registry entry for an instance id, or null. */
export function propSheetFor(id) {
  return SHEET_BY_ID.get(id) || null;
}

/** True when this entry ships as a full-object sprite sheet. */
export function isAnimatedProp(entry) {
  return Boolean(entry) && entry.type === PROP_ANIMATED;
}

/** Phaser animation key for an animated entry. */
export function propAnimationKeyFor(entry) {
  return entry ? `prop_${entry.id}` : '';
}

/** Playback order for a sheet: its explicit `frameOrder`, else 0..frames-1. */
export function propFrameOrderFor(entry) {
  if (!entry) return [];
  if (entry.frameOrder) return [...entry.frameOrder];
  return Array.from({ length: entry.frames || 0 }, (_, index) => index);
}

/** The frame a sheet holds when it is not running: unattended, or reduced motion. */
export function propStaticFrameFor(entry) {
  if (!entry) return 0;
  if (Number.isInteger(entry.staticFrame)) return entry.staticFrame;
  return propFrameOrderFor(entry)[0] ?? 0;
}

/**
 * Where a piece of art lands, derived from the whitebox `box` it covers —
 * bottom-centre, so a Sprite Fusion export that grew taller or wider than the
 * whitebox keeps the same floor contact point instead of sliding. The registry
 * holds no coordinates of its own; sceneConfig.mjs stays authoritative.
 */
export function propAnchorFor(entry, box) {
  if (!box) return null;
  const originX = entry?.originX === undefined ? 0.5 : entry.originX;
  const originY = entry?.originY === undefined ? 1 : entry.originY;
  return {
    x: box.x + box.w / 2 + (entry?.offsetX || 0),
    y: box.y + box.h + (entry?.offsetY || 0),
    originX,
    originY,
    scale: entry?.scale === undefined ? 1 : entry.scale
  };
}

// Contact-shadow shaping. The generated radial fades to nothing at its own edge,
// so the pool is drawn wider than the art it grounds: `SPREAD` puts the art's
// width at roughly the gradient's 0.72 stop, where it is still visibly dark.
const SHADOW_SPREAD = 1.4;
const SHADOW_SQUASH = 0.22;
const SHADOW_ALPHA = 0.55;
const SHADOW_MIN_HEIGHT = 18;

/**
 * The floor pool a piece of art casts, or null when it casts none. Deliberately
 * a sibling of `propAnchorFor` rather than more keys on it: the anchor contract
 * is a fixed five-key shape that several tests compare whole.
 *
 * The contact line is `box.y + box.h` for every shipped sheet, and that is not a
 * coincidence — `offsetY` exists precisely because those cells carry empty rows
 * *below* the art, so pushing the sprite down by the slack lands the art's real
 * bottom edge back on the box's bottom edge. Width comes from the measured art,
 * falling back to the whitebox footprint for art nobody has measured yet.
 */
export function propShadowFor(entry, box) {
  if (!box || entry?.groundShadow === false) return null;
  const width = (entry?.shadowWidth || box.w) * SHADOW_SPREAD;
  return {
    x: box.x + box.w / 2 + (entry?.offsetX || 0),
    y: box.y + box.h,
    width,
    height: Math.max(SHADOW_MIN_HEIGHT, width * SHADOW_SQUASH),
    alpha: SHADOW_ALPHA
  };
}

/**
 * The entries whose file the manifest actually ships, deduped by texture key so
 * one file shared by two instances (both wide crates) is fetched once.
 * Everything unlisted keeps its whitebox and makes zero requests.
 */
export function propsToPreload(manifest) {
  const listed = manifest instanceof Set ? manifest : new Set(manifest || []);
  const seen = new Set();
  return PROP_SHEETS.filter((entry) => {
    if (!entry.art || !listed.has(entry.art)) return false;
    if (seen.has(entry.textureKey)) return false;
    seen.add(entry.textureKey);
    return true;
  });
}

/**
 * Queue one entry on a Phaser loader. A static prop is a plain image; a full
 * animated object rides the same spritesheet seam the character sheets use,
 * with the frame size its file was actually exported at.
 */
export function queuePropArt(entry, loader) {
  if (!entry || !loader) return '';
  if (isAnimatedProp(entry)) {
    loader.spritesheet(entry.textureKey, entry.art, {
      frameWidth: entry.frameWidth,
      frameHeight: entry.frameHeight
    });
    return entry.textureKey;
  }
  loader.image(entry.textureKey, entry.art);
  return entry.textureKey;
}

/**
 * Register an animated entry's loop, exactly once. Static entries are a no-op —
 * there is no animation to create and no overlay layer to feed.
 */
export function ensurePropAnimation(entry, anims) {
  if (!isAnimatedProp(entry) || !anims) return '';
  const key = propAnimationKeyFor(entry);
  if (anims.exists(key)) return key;
  anims.create({
    key,
    frames: anims.generateFrameNumbers(entry.textureKey, { frames: propFrameOrderFor(entry) }),
    frameRate: entry.fps,
    repeat: entry.repeat === undefined ? -1 : entry.repeat
  });
  return key;
}

/**
 * What the scene should do with an entry: nothing for a static image, otherwise
 * a held frame or the loop. A machine is not ambiently animated — it holds its
 * first frame and only runs while `active`, which the scene raises for the one
 * machine currently being worked at and lowers again when that ends. There is
 * no per-tick re-issue: playback changes when attendance changes.
 *
 * Both stillness cases hold a frame out of the same sheet, so neither reduced
 * motion nor an unattended machine ever requires a second, static PNG.
 */
export function propPlaybackFor(entry, { reducedMotion = false, active = false } = {}) {
  if (!isAnimatedProp(entry)) return null;
  if (reducedMotion || !active) return { kind: 'frame', frame: propStaticFrameFor(entry) };
  return { kind: 'play', key: propAnimationKeyFor(entry) };
}

/** Whitebox prop bodies owned by real art, and therefore not drawn. */
export function replacedWhiteboxKeys(entries) {
  const keys = new Set();
  (entries || []).forEach((entry) => (entry.covers || []).forEach((key) => keys.add(key)));
  return keys;
}

/**
 * Whitebox components owned by real art, and therefore not built. A real
 * machine — static or animated — is the complete object, so its procedural
 * screens, LEDs, sweeps, coils and fans go with it.
 */
export function replacedComponentKeys(entries) {
  const keys = new Set();
  (entries || []).forEach((entry) => (entry.coversComponents || []).forEach((key) => keys.add(key)));
  return keys;
}
