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
// twelve machines ship real animated sheets today (Opportunity Radar, Tool
// Scanner, Newsletter Still, X Uplink, Creator Console, Repo Forge, Model
// Furnace, Profit Analyzer, Publish Transmitter, News Array, Experiment Bench,
// Agent Lab), the Ops Console ships the room's first real STATIC prop and the
// wall sigil ships the second; all fourteen render as finished art. An entry
// naming a file the manifest does not list makes zero requests and keeps its
// whitebox — exactly one is left, `wall_crt_bank`, whose whitebox is the GA//OPS
// readout's housing and is deliberately protected from every cleanup pass. The
// blank filler that used to sit alongside it — the wall receptacle, both wide
// crates and the vent bank — was deleted with its geometry rather than left
// waiting on art that was never going to be drawn.
//
// Static and animated are equal citizens on that seam: the Ops Console is a
// complete machine that simply has nothing moving in it, so it retires its
// whitebox body and its components exactly the way a sheet does, and carries the
// same two measured numbers (`offsetY`, `shadowWidth`) off the same real PNG.
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
//              the Tool Scanner's 104px bench sits in a 168px box, and the Model
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
  // Central Operations (zone 01). The room's first shipped STATIC prop, and the
  // proof that a finished machine does not have to move: one transparent PNG is
  // the whole console — both wing desks, the throne seat, the overhead arch and
  // every lit readout on it — so the whitebox desk and all three of its
  // procedural components retire together and nothing is painted on top. The
  // 201x203 cell keeps 50 empty rows under the console feet, so `offsetY` puts
  // its bottom edge back on the box's bottom edge rather than 50px high.
  // `shadowWidth` is the art's real 168px width, not the 192px floor-plan box.
  Object.freeze({
    id: 'ops_console',
    type: PROP_STATIC,
    art: `${ART_ROOT}/prop_ops_console.png`,
    textureKey: 'prop_ops_console',
    offsetY: 50,
    shadowWidth: 168,
    covers: Object.freeze(['prop_ops_console']),
    coversComponents: Object.freeze(['anim_ops_desk_screens', 'anim_keyboard_leds', 'anim_ops_caret'])
  }),
  // News Array (zone 02). The first shipped sheet that hangs on the wall: shells,
  // cycling CRT cells and the packet traffic that used to be `anim_feed_cycle`
  // are one object, so the whitebox strip and its component retire together. It
  // keeps `groundShadow: false` and declares no `shadowWidth` — the display
  // stands on nothing, and a pool under it would be a shadow cast by a wall.
  // The 201x204 cell keeps 70 empty rows below the display, so `offsetY` puts
  // its bottom edge back on the wall strip's bottom edge rather than 70px low.
  // 6fps is one 1.333s feed cycle.
  Object.freeze({
    id: 'wall_feed_shells',
    type: PROP_ANIMATED,
    art: `${ART_ROOT}/anim_news_array_sheet.png`,
    textureKey: 'anim_news_array',
    sheetWidth: 1608,
    sheetHeight: 204,
    frameWidth: 201,
    frameHeight: 204,
    frames: 8,
    fps: 6,
    repeat: -1,
    offsetY: 70,
    groundShadow: false,
    covers: Object.freeze(['prop_wall_feed_shells']),
    coversComponents: Object.freeze(['anim_feed_cycle'])
  }),
  // Agent Lab (zone 12). The room's second wall-hung sheet, and the machine that
  // finally stopped sharing Tool Scanner's bench. The whole cabinet — shell,
  // readouts, plumbing and the lit central chamber that is the only thing that
  // moves — is one object, so it declares no components to retire and there is
  // nothing procedural left to draw on top of it. `groundShadow: false` and no
  // `shadowWidth`: it hangs on the wall and stands on nothing. The 203x202 cell
  // keeps 20 empty rows below the cabinet, so `offsetY` puts its bottom edge back
  // on the box's bottom edge. 6fps is one 1.333s chamber cycle.
  Object.freeze({
    id: 'wall_agent_lab',
    type: PROP_ANIMATED,
    art: `${ART_ROOT}/anim_agent_lab_sheet.png`,
    textureKey: 'anim_agent_lab',
    sheetWidth: 1624,
    sheetHeight: 202,
    frameWidth: 203,
    frameHeight: 202,
    frames: 8,
    fps: 6,
    repeat: -1,
    offsetY: 20,
    groundShadow: false,
    covers: Object.freeze(['prop_wall_agent_lab']),
    coversComponents: Object.freeze([])
  }),
  // Opportunity Radar (zone 13). The sheet is the whole terminal — cabinet, bezel
  // and the sweep that used to be `anim_radar_sweep` — so no static body loads
  // underneath it. This replacement is a native 1600x200 sheet with 200x200
  // frames; 32 empty rows under the drum put its real contact back on the box
  // floor, and its measured 88px width sizes the generated shadow. 8 frames at
  // 8fps is one 1.000s revolution.
  Object.freeze({
    id: 'radar_drum',
    type: PROP_ANIMATED,
    art: `${ART_ROOT}/anim_opportunity_radar_sheet.png`,
    textureKey: 'anim_opportunity_radar',
    sheetWidth: 1600,
    sheetHeight: 200,
    frameWidth: 200,
    frameHeight: 200,
    frames: 8,
    fps: 8,
    repeat: -1,
    offsetY: 32,
    shadowWidth: 88,
    covers: Object.freeze(['prop_radar_drum']),
    coversComponents: Object.freeze(['anim_radar_sweep'])
  }),
  // Tool Scanner (zone 03). Bench, dish and status lamps are one object, so the
  // whitebox scan bar and ready lamp retire with the body. The replacement is a
  // native-scale 1600x200 sheet with 200x200 cells. Its 20 empty rows under
  // the feet put the art back on the box's floor line, and the 104px opaque
  // width sizes the generated contact shadow. 6fps is one 1.333s dish rotation.
  Object.freeze({
    id: 'scanner_bench',
    type: PROP_ANIMATED,
    art: `${ART_ROOT}/anim_tool_scanner_sheet.png`,
    textureKey: 'anim_tool_scanner',
    sheetWidth: 1600,
    sheetHeight: 200,
    frameWidth: 200,
    frameHeight: 200,
    frames: 8,
    fps: 6,
    repeat: -1,
    offsetY: 20,
    shadowWidth: 104,
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
  // the one-machine-one-owner invariant. The native-scale replacement is an
  // 8x200x200 sheet with 36px bottom slack and 148px of opaque art. 6fps is one
  // 1.333s CRT cycle.
  Object.freeze({
    id: 'x_console',
    type: PROP_ANIMATED,
    art: `${ART_ROOT}/anim_x_uplink_sheet.png`,
    textureKey: 'anim_x_uplink',
    sheetWidth: 1600,
    sheetHeight: 200,
    frameWidth: 200,
    frameHeight: 200,
    frames: 8,
    fps: 6,
    repeat: -1,
    offsetY: 36,
    shadowWidth: 148,
    covers: Object.freeze(['prop_x_console', 'prop_x_mast']),
    coversComponents: Object.freeze(['anim_x_crt', 'anim_x_lamps', 'anim_x_dish'])
  }),
  // Publish Transmitter (zone 07). Cabinet, CRT, charge meter and pilot lamp are
  // one object, so all three whitebox components retire with the body. The art is
  // 85px wide centred on x780 and never reached the 24px wall receptacle at x912
  // — that box was blank whitebox filler and is now deleted outright, so the
  // cabinet is the whole of zone 07. The 149x144 cell keeps 32 empty rows under
  // the cabinet feet. 6fps is one 1.333s ambient cycle.
  Object.freeze({
    id: 'tx_body',
    type: PROP_ANIMATED,
    art: `${ART_ROOT}/anim_publish_transmitter_sheet.png`,
    textureKey: 'anim_publish_transmitter',
    sheetWidth: 1192,
    sheetHeight: 144,
    frameWidth: 149,
    frameHeight: 144,
    frames: 8,
    fps: 6,
    repeat: -1,
    offsetY: 32,
    shadowWidth: 85,
    covers: Object.freeze(['prop_tx_body']),
    coversComponents: Object.freeze(['anim_tx_crt', 'anim_tx_charge', 'anim_tx_pilot'])
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
  // Experiment Bench (zone 09). The entry that used to sit here was `core_well`,
  // the Power Core's static deliverable. The Power Core was retired — it was
  // scenery that drove nothing, sitting in the best floor pocket in the room —
  // and the Experiment Bench moved onto that same 144x96 box, ending the
  // three-way share of `prop_scanner_bench`. The sheet is the complete wooden
  // alchemist bench: potions, books, the magical circle and its spell effects all
  // move in frame, so there is nothing procedural to paint on top and
  // `coversComponents` is empty. The 203x203 cell keeps 57 empty rows under the
  // bench feet, so `offsetY` puts them back on the floor line. 6fps is one 1.333s
  // ambient loop.
  Object.freeze({
    id: 'experiment_bench',
    type: PROP_ANIMATED,
    art: `${ART_ROOT}/anim_experiment_bench_sheet.png`,
    textureKey: 'anim_experiment_bench',
    sheetWidth: 1624,
    sheetHeight: 203,
    frameWidth: 203,
    frameHeight: 203,
    frames: 8,
    fps: 6,
    repeat: -1,
    offsetY: 57,
    shadowWidth: 127,
    covers: Object.freeze(['prop_experiment_bench']),
    coversComponents: Object.freeze([])
  }),
  // Creator Console (zone 10). Split off `prop_wall_feed_shells`, which three
  // unrelated machines shared, onto a floor console of its own during the
  // geometry pass, and now shipping as one full-object sheet: cabinet, the
  // three-cell editorial CRT row and its signal traffic all move in frame, so
  // the whitebox screens retire with the body. The 200x200 cell keeps 32 empty
  // rows under the plinth. 6fps is one 1.333s ambient cycle.
  Object.freeze({
    id: 'creator_console',
    type: PROP_ANIMATED,
    art: `${ART_ROOT}/anim_creator_console_sheet.png`,
    textureKey: 'anim_creator_console',
    sheetWidth: 1600,
    sheetHeight: 200,
    frameWidth: 200,
    frameHeight: 200,
    frames: 8,
    fps: 6,
    repeat: -1,
    offsetY: 32,
    flipX: true,
    shadowWidth: 136,
    covers: Object.freeze(['prop_creator_console']),
    coversComponents: Object.freeze(['anim_creator_screens'])
  }),
  // Profit Analyzer (zone 11). Split off `prop_wall_feed_shells` onto a floor
  // console of its own during the geometry pass, and now shipping as one
  // full-object sheet: cabinet, the gold analysis CRT row and its pulses all
  // move in frame, so the whitebox screens retire with the body. The 197x197
  // cell keeps 19 empty rows under the plinth. 6fps is one 1.333s ambient cycle.
  Object.freeze({
    id: 'profit_analyzer',
    type: PROP_ANIMATED,
    art: `${ART_ROOT}/anim_profit_analyzer_sheet.png`,
    textureKey: 'anim_profit_analyzer',
    sheetWidth: 1576,
    sheetHeight: 197,
    frameWidth: 197,
    frameHeight: 197,
    frames: 8,
    fps: 6,
    repeat: -1,
    offsetY: 19,
    shadowWidth: 133,
    covers: Object.freeze(['prop_profit_analyzer']),
    coversComponents: Object.freeze(['anim_profit_screens'])
  }),
  // Unzoned dressing, and the only piece of it left: the gold Alchemists emblem,
  // now shipped art. The small crate at 300,180 went with art pass 2 (the Creator
  // Console art swallowed it whole), and the cleanup pass took both wide crates
  // and the vent bank the same way — box and entry together, never one without
  // the other. The emblem is the opposite case: the entry stays and the whitebox
  // goes, because the art arrived.
  //
  // The 64x64 cell keeps 1 empty row under the glyph, so `offsetY: 1` puts its
  // last opaque row back on the box's bottom edge at y86 — the same measured-slack
  // rule the Ops Console's 50 and the News Array's 70 come from. The glyph is
  // 47x62 of real pixels centred to within 0.5px of the cell centre, so it needs
  // no origin or `offsetX` override, and it lands x614-661, y24-86: level at the
  // top with the GA//OPS bank beside it and inside the 120px wall band.
  //
  // `groundShadow: false` and no `shadowWidth`: an emblem bolted to the wall
  // stands on nothing, and a pool on the floor under it would be a shadow with no
  // caster.
  Object.freeze({
    id: 'wall_sigil',
    type: PROP_STATIC,
    art: `${ART_ROOT}/prop_wall_sigil.png`,
    textureKey: 'prop_wall_sigil',
    offsetY: 1,
    groundShadow: false,
    covers: Object.freeze(['prop_wall_sigil']),
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
 * one file shared by several instances is fetched once. No entry shares a
 * texture today — the wide crates were the last pair and both were deleted — but
 * the guard is loader hygiene, not a crate special case, and one file at two
 * anchors stays a legal registry shape. Everything unlisted keeps its whitebox
 * and makes zero requests.
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
