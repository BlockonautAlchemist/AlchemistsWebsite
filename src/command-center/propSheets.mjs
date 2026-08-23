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

// Seeded from the paths sceneConfig already declared, so the room renders
// exactly as it does today: the manifest lists none of these, nothing preloads,
// every machine stays whitebox.
//
// `id`         unique instance. Two instances may share one `textureKey`
//              (both racks, both wide crates) — the file is fetched once.
// `textureKey` the Phaser texture key.
// `covers`     whitebox prop keys this asset replaces. covers[0] is the anchor.
// `coversComponents`
//              whitebox component keys this machine no longer needs.
//
// Animated entries additionally carry measured `sheetWidth` / `sheetHeight` /
// `frameWidth` / `frameHeight` / `frames` / `fps` / `repeat`, and may override
// `frameOrder` and `staticFrame`. Any entry may override `offsetX` / `offsetY` /
// `originX` / `originY` / `scale` for an awkward export.
export const PROP_SHEETS = Object.freeze([
  Object.freeze({
    id: 'wall_crt_bank',
    type: PROP_STATIC,
    art: `${ART_ROOT}/prop_wall_crt_bank.png`,
    textureKey: 'prop_wall_crt_bank',
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
    covers: Object.freeze(['prop_wall_feed_shells']),
    coversComponents: Object.freeze(['anim_feed_cycle'])
  }),
  Object.freeze({
    id: 'radar_drum',
    type: PROP_STATIC,
    art: `${ART_ROOT}/prop_radar_drum.png`,
    textureKey: 'prop_radar_drum',
    covers: Object.freeze(['prop_radar_drum']),
    coversComponents: Object.freeze(['anim_radar_sweep'])
  }),
  Object.freeze({
    id: 'scanner_bench',
    type: PROP_STATIC,
    art: `${ART_ROOT}/prop_scanner_bench.png`,
    textureKey: 'prop_scanner_bench',
    covers: Object.freeze(['prop_scanner_bench']),
    coversComponents: Object.freeze(['anim_scan_bar', 'anim_scan_lamp'])
  }),
  Object.freeze({
    id: 'code_bench',
    type: PROP_STATIC,
    art: `${ART_ROOT}/prop_code_bench.png`,
    textureKey: 'prop_code_bench',
    covers: Object.freeze(['prop_code_bench']),
    coversComponents: Object.freeze(['anim_code_scroll', 'anim_code_leds'])
  }),
  Object.freeze({
    id: 'disk_tower',
    type: PROP_STATIC,
    art: `${ART_ROOT}/prop_disk_tower.png`,
    textureKey: 'prop_disk_tower',
    covers: Object.freeze(['prop_disk_tower']),
    coversComponents: Object.freeze(['anim_disk_reel'])
  }),
  Object.freeze({
    id: 'still_column',
    type: PROP_STATIC,
    art: `${ART_ROOT}/prop_still_column.png`,
    textureKey: 'prop_still_column',
    covers: Object.freeze(['prop_still_column']),
    coversComponents: Object.freeze(['anim_still_chamber', 'anim_still_coil'])
  }),
  Object.freeze({
    id: 'still_tray',
    type: PROP_STATIC,
    art: `${ART_ROOT}/prop_still_tray.png`,
    textureKey: 'prop_still_tray',
    covers: Object.freeze(['prop_still_tray']),
    coversComponents: Object.freeze(['anim_tray_print'])
  }),
  Object.freeze({
    id: 'x_console',
    type: PROP_STATIC,
    art: `${ART_ROOT}/prop_x_console.png`,
    textureKey: 'prop_x_console',
    covers: Object.freeze(['prop_x_console']),
    coversComponents: Object.freeze(['anim_x_crt', 'anim_x_lamps'])
  }),
  Object.freeze({
    id: 'x_mast',
    type: PROP_STATIC,
    art: `${ART_ROOT}/prop_x_mast.png`,
    textureKey: 'prop_x_mast',
    covers: Object.freeze(['prop_x_mast']),
    coversComponents: Object.freeze(['anim_x_dish'])
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
    covers: Object.freeze(['prop_wall_receptacle']),
    coversComponents: Object.freeze([])
  }),
  // Both racks are one file at two anchors: one fetch, two instances.
  Object.freeze({
    id: 'rack_a',
    type: PROP_STATIC,
    art: `${ART_ROOT}/prop_rack.png`,
    textureKey: 'prop_rack',
    covers: Object.freeze(['prop_rack_a']),
    coversComponents: Object.freeze(['anim_rack_leds'])
  }),
  Object.freeze({
    id: 'rack_b',
    type: PROP_STATIC,
    art: `${ART_ROOT}/prop_rack.png`,
    textureKey: 'prop_rack',
    covers: Object.freeze(['prop_rack_b']),
    coversComponents: Object.freeze(['anim_fan'])
  }),
  Object.freeze({
    id: 'furnace_chamber',
    type: PROP_STATIC,
    art: `${ART_ROOT}/prop_furnace_chamber.png`,
    textureKey: 'prop_furnace_chamber',
    covers: Object.freeze(['prop_furnace_chamber']),
    coversComponents: Object.freeze(['anim_furnace_heat'])
  }),
  Object.freeze({
    id: 'core_well',
    type: PROP_STATIC,
    art: `${ART_ROOT}/prop_core_well.png`,
    textureKey: 'prop_core_well',
    covers: Object.freeze(['prop_core_well']),
    coversComponents: Object.freeze(['anim_core_pulse', 'anim_core_sigil', 'anim_core_seed'])
  }),
  // Unzoned dressing: no machine components of their own.
  Object.freeze({
    id: 'crate_small',
    type: PROP_STATIC,
    art: `${ART_ROOT}/prop_crate_small.png`,
    textureKey: 'prop_crate_small',
    covers: Object.freeze(['prop_crate_small']),
    coversComponents: Object.freeze([])
  }),
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
    covers: Object.freeze(['prop_wall_sigil']),
    coversComponents: Object.freeze([])
  }),
  Object.freeze({
    id: 'wall_vents',
    type: PROP_STATIC,
    art: `${ART_ROOT}/prop_wall_vents.png`,
    textureKey: 'prop_wall_vents',
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

/** The frame reduced motion holds for a sheet. */
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

/**
 * The entries whose file the manifest actually ships, deduped by texture key so
 * one file shared by two instances (both racks, both wide crates) is fetched
 * once. Everything unlisted keeps its whitebox and makes zero requests.
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
 * What the scene should do with an entry once, at build time: nothing for a
 * static image, a held frame under reduced motion, otherwise the loop. Ambient
 * machine animation just stays on — there is no on/off state machine, and
 * nothing re-issues this per tick.
 *
 * Reduced motion holds a frame out of the same sheet; it never requires a
 * second, static PNG.
 */
export function propPlaybackFor(entry, { reducedMotion = false } = {}) {
  if (!isAnimatedProp(entry)) return null;
  if (reducedMotion) return { kind: 'frame', frame: propStaticFrameFor(entry) };
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
