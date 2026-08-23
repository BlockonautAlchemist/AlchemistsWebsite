# Command Center art drop

Generated pixel art goes here. The scene ships as the design's scale-true whitebox and
swaps to art **per file**, so this directory can fill up one asset at a time.

## Machine → Hermes workflow mapping

This is semantic mapping only. Coordinates stay in `src/command-center/sceneConfig.mjs`,
and production art stays in `src/command-center/propSheets.mjs`.

| machine | Hermes job(s) | workflow/lane | purpose | pixel-art visual description |
| --- | --- | --- | --- | --- |
| News Array | AI News | `ai-news` | AI gaming news intelligence | Wall feed shells with cycling CRT cells and cyan packets |
| Repo Forge | GitHub | `github` | Repository and code-signal watch | Green code bench, phosphor terminal, disk tower |
| Tool Scanner | New Tools | `new-tools` | New AI/game-dev tool discovery | Long scanner bench, cyan scan bar, ready lamp |
| Agent Lab | Agents | `agents` | Agent workflow and automation review | Shared scanner bench with compact lab sweeps |
| Model Furnace | Models Infra | `models-infra` | Model routing and infrastructure evaluation | Twin racks feeding a heated processing chamber |
| Creator Console | Creator Content | `creator-content` | Creator-facing intelligence angles | Research feed shells with editorial signal traffic |
| Profit Analyzer | Monetization | `monetization` | Monetization and partner opportunity review | Research feed shells with warmer analysis pulses |
| Experiment Bench | Playbooks | `playbooks` | Playbooks and repeatable experiments | Shared scanner bench with test sweeps and status lamps |
| Newsletter Still | Newsletter, Finisher | `newsletter` | Longer-form newsletter distillation | Tall still column, coil, chamber fill, output tray |
| X Uplink | X Draft, X Publish, X Amplify | `social-x` | Public X formatting and transmission | Communications console, transport CRT, antenna mast |
| Publish Transmitter | Beehiiv Draft | `terminal-publisher` | Terminal/Beehiiv publish handoff | Heavy transmitter cabinet, wall receptacle, charge meter |
| Opportunity Radar | `254525fa846f` / Opportunity Scout | Hermes-only, no workflow lane yet | Opportunity scouting reserve mapping | Ribbed radar drum with a dominant circular sweep |

Opportunity Radar is configured for Hermes semantics, but no frontend workflow key is
invented until real telemetry emits one. Sprite Fusion prompts should use one dominant
silhouette, one obvious functional feature, and a few accents.

## Two production asset types — and nothing else

Every machine and prop is delivered as **exactly one** of these:

| mode | file | what it is |
| --- | --- | --- |
| **static prop** | `prop_<name>.png` | one transparent PNG that is the complete object |
| **animated prop** | `anim_<name>_sheet.png` | one sprite sheet where **every frame contains the complete object** |

An animated sheet **is** the machine. There is no static body rendered underneath it and
no animated overlay rendered above it. Both modes render at the same depth, on the same
code path, at the same place in the room.

**You never ship both files for the same machine**, and you never hand-extract a moving
subcomponent — no separate screens, radar sweeps, LED clusters, CRT regions, coils or
fans. The art pipeline is [Sprite Fusion](https://www.spritefusion.com/): design the
whole machine, run Sprite Fusion Animate on the whole machine, export the sheet.

The old "static prop + small animated component overlay" contract is **superseded** — see
the legacy section at the bottom.

## How the swap works

1. Drop the PNG in this directory under exactly the filename below.
2. Add that path to `manifest.json`:

   ```json
   { "files": ["/assets/command-center/anim_radar_drum_sheet.png"] }
   ```

3. Add (or edit) its entry in the art registry,
   `src/command-center/propSheets.mjs` — see the two examples below.
4. Reload. `CommandCenterScene.preload()` queues only manifest-listed files, so an
   empty manifest makes zero failed requests and every unlisted machine keeps its
   whitebox.

**No coordinates live in the registry.** `src/command-center/sceneConfig.mjs` stays
authoritative for machine geometry: the registry names the prop key it covers and the
scene anchors the file **bottom-centre** on that box (`x + w/2`, `y + h`, origin `0.5, 1`
— the same rule SpawnCamper uses). A Sprite Fusion export that came out taller or wider
than the whitebox therefore grows upward and outward from the same floor contact point
instead of sliding off its station. `offsetX` / `offsetY` / `originX` / `originY` /
`scale` overrides exist in the registry for an awkward export.

All files are transparent PNGs with hard pixel edges, except `env_floor_wall.png` which
is opaque. No semi-transparent anti-aliasing on machine edges or the 3/4 overlap seams
show. Textures are pinned to NEAREST at load.

## L1 · environment (opaque)

| file | size | notes |
| --- | --- | --- |
| `env_floor_wall.png` | 960x528 | single image, zero props, zero characters |
| `env_conduit_channels.png` | 960x528 | alpha, dark channel inlays only, no glow |

## L2 · static props

`prop_<name>.png` — one transparent PNG containing the **complete** object. The PNG is
the whole visible machine; nothing is composited on top of it at runtime.

```js
// src/command-center/propSheets.mjs
Object.freeze({
  id: 'ops_console',
  type: PROP_STATIC,
  art: `${ART_ROOT}/prop_ops_console.png`,
  textureKey: 'prop_ops_console',
  covers: Object.freeze(['prop_ops_console']),
  coversComponents: Object.freeze(['anim_ops_desk_screens', 'anim_keyboard_leds', 'anim_ops_caret'])
})
```

The sizes below are the **whitebox box** each machine occupies in `sceneConfig.mjs`, which
is what the art is anchored to. They are a target, not a constraint: the real export
governs, and an export that differs still lands bottom-centre on the same box.

| file | size | zone |
| --- | --- | --- |
| `prop_ops_console.png` | 192x72 | 01 |
| `prop_wall_crt_bank.png` | 216x84 | 01, wall-mounted |
| `prop_radar_drum.png` | 96x72 | 02 |
| `prop_wall_feed_shells.png` | 232x38 | 02, 4 shells in one file |
| `prop_scanner_bench.png` | 168x48 | 03 |
| `prop_code_bench.png` | 168x72 | 04 |
| `prop_disk_tower.png` | 36x72 | 04 |
| `prop_still_column.png` | 72x144 | 05 |
| `prop_still_tray.png` | 60x48 | 05 |
| `prop_x_console.png` | 144x72 | 06 |
| `prop_x_mast.png` | 48x110 | 06, includes dish |
| `prop_tx_body.png` | 168x96 | 07 |
| `prop_rack.png` | 72x120 | 08, two instances |
| `prop_furnace_chamber.png` | 120x72 | 08 |
| `prop_core_well.png` | 144x96 | 09, recessed, no glow baked |

## L3 · animated props (full-object sprite sheets)

`anim_<name>_sheet.png` — one horizontal sprite sheet in which **every single frame
contains the entire object**, including whatever moves inside it.

* The sheet **replaces** the machine's static representation. There is no
  `prop_<name>.png` beneath it and no overlay above it. Do **not** produce both files for
  one machine.
* There is **no requirement to isolate moving parts**. A radar drum's sheet contains the
  drum *and* its sweep. A still column's sheet contains the column, its chamber fill *and*
  its coil. Exporting Sprite Fusion Animate over the whole object is the intended workflow.
* **Frame dimensions and frame counts differ per asset.** Measure the actual PNG and record
  `sheetWidth` / `sheetHeight` / `frameWidth` / `frameHeight` / `frames` / `fps` in the
  registry. A test asserts the frames tile the sheet exactly, so a mismeasured entry fails
  `npm test` rather than rendering torn.
* Animation is simply **on**: it loops for as long as the Command Center is displayed.
  There is no machine-animation state system, and the loop is issued once at build time —
  never re-issued on an update tick.
* Under `prefers-reduced-motion` the sprite holds a **frame out of the same sheet**
  (`staticFrame`, default the first frame). No second, static PNG is ever required as an
  animation fallback.
* A machine's real asset — static or animated — retires the whitebox components listed in
  its `coversComponents`, because a real machine is already complete.

```js
// src/command-center/propSheets.mjs — measured off the real PNG, not copied from here
Object.freeze({
  id: 'radar_drum',
  type: PROP_ANIMATED,
  art: `${ART_ROOT}/anim_radar_drum_sheet.png`,
  textureKey: 'anim_radar_drum',
  sheetWidth: 768, sheetHeight: 72,
  frameWidth: 96, frameHeight: 72, frames: 8, fps: 12, repeat: -1,
  covers: Object.freeze(['prop_radar_drum']),
  coversComponents: Object.freeze(['anim_radar_sweep'])
})
```

Sheet layout matches the character contract: a single horizontal row, zero margin, zero
spacing, RGBA8, non-interlaced, binary alpha, so NEAREST never interpolates an edge.

**Missing art is not an error.** If a file is absent, unlisted in `manifest.json`, or fails
to load, the machine keeps its procedural whitebox. The whitebox is the development
fallback and the only fallback — production art is never duplicated to provide one.

## L4 · character

The character ships **one sheet per animation**, each at whatever frame size it was
actually exported at. `src/command-center/camperSheets.mjs` is the registry: add the
file here, list it in `manifest.json`, add its measured entry to `CAMPER_SHEETS`.
Frame size, frame count, fps, playback order and origin are **per-sheet registry data** —
a future sheet is free to ship a different frame size or a different number of frames,
and nothing in the scene assumes the grid below. Visuals with no sheet yet fall back to
`idle`, so a partial drop still replaces the whitebox rig everywhere.

These six are the current production character. The sizes are measured from the PNGs,
not from the design bible.

| file | sheet | frames | frame | fps | origin | scale | purpose |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `spawncamper_idle_sheet.png` | 864x108 | 8 | 108x108 | 8 | 0.5, 1 | 1 | `idle` — stationary at home or between jobs; the fallback for any mode without art |
| `spawncamper_walk_front_sheet.png` | 864x108 | 8 | 108x108 | 12 | 0.5, 1 | 1 | `walk_front` — travelling down the screen (positive Y), facing camera |
| `spawncamper_walk_back_sheet.png` | 904x113 | 8 | 113x113 | 12 | 0.5, 1 | 1 | `walk_back` — travelling up the screen (negative Y), back to camera |
| `spawncamper_walk_left_sheet.png` | 880x110 | 8 | 110x110 | 12 | 0.5, 1 | 1 | `walk_left` — travelling left (negative X), in profile |
| `spawncamper_walk_right_sheet.png` | 880x110 | 8 | 110x110 | 12 | 0.5, 1 | 1 | `walk_right` — travelling right (positive X), in profile |
| `spawncamper_operate_back_sheet.png` | 904x113 | 8 | 113x113 | 10 | 0.5, 1 | 1 | `operate_back` — stationary at a workstation, back to camera, working the machine |

Shared properties, verified per frame against the actual pixels: single horizontal row,
zero margin, zero spacing, RGBA8, non-interlaced, and **strictly binary alpha** — not one
semi-transparent pixel in any of the six — so NEAREST never interpolates an edge. As with
idle, the transparent pixels carry a leftover key colour under `alpha 0`, which is
harmless and is **not** stripped at runtime; there is no chroma-key or background-removal
code anywhere in the scene.

**Ground contact is the frame's bottom edge in every frame of all six sheets** (worst
case one row of slack on three frames). That is what lets a single `originY: 1` hold his
feet on the anchor even though frame heights differ (108 / 110 / 113), so switching
animations produces no vertical hop and the walk graph keeps addressing the same ground
point it always did. Horizontal content centre never drifts more than ~1.2px from the
cell centre, so `originX: 0.5` holds for all six too — **no sheet needs an origin
override**. Every sheet is scale `1`; no `setDisplaySize`, no fractional scaling.

`spawncamper_walk_right_sheet.png` was produced by mirroring the approved left sheet as
one strip, which mirrors the column order too: `right[j]` is pixel-identical to
`mirror(left[7 - j])` (frames 1-6 byte-exact; frames 0 and 7 differ only in RGB
underneath fully transparent pixels, so they render identically). Playing it 0→7 would
run the approved cadence backwards in time, so its registry entry declares
`frameOrder: [7,6,5,4,3,2,1,0]`. It loads as its own independent texture, and **no
`flipX` is applied anywhere** — the mirror is physically in the PNG. The PNG itself is
never modified.

**No baked contact shadow** in any of these exports, unlike the superseded contract
below. The scene draws a 72x8 ellipse (60% `#0d0214`) under the sprite instead. Bake one
into a future sheet and set `bakedShadow: true` on its registry entry to drop it.

### Logical mode → visual animation

Telemetry state names and animation names are separate vocabularies and stay that way;
the inspector always reports the real logical mode (`NEWSLETTER`, `RESEARCHING`, …),
never an animation name. The legacy mode names in `visualMappings.mjs` predate the art
and are deliberately not renamed — SpawnCamper now has mechanical legs, but a repo-wide
rename would buy terminology and risk telemetry. `CAMPER_VISUAL_FOR_MODE` in
`camperSheets.mjs` is the entire bridge:

| logical mode | stationary visual | why |
| --- | --- | --- |
| `idle` | `idle` | |
| `operate` | `operate_back` | writing, coding, processing, publishing, X, newsletter, terminal |
| `inspect` | `operate_back` | researching, scanning, evaluating, thinking — all stationary machine work |
| `hover_travel_front` / `hover_travel_back` | `operate_back` | legacy travel names surviving as the *resting* mode of `browsing` and `executing`; a resting mode is only ever applied once he has stopped at a station anchor, and both are machine-oriented work |
| `react` | `idle` | no react sheet drawn yet — safe fallback, never the whitebox rig |

Walk animations are **never** selected from a mode name. While a route is in flight the
visual comes from the segment actually being traversed, recomputed as each leg starts:
`+Y → walk_front`, `-Y → walk_back`, `-X → walk_left`, `+X → walk_right`. A route that
goes right then up switches `walk_right → walk_back` at the turn, not on arrival. On
arrival the pending logical mode resolves through the table above, giving
`idle → walk_* → operate_back → walk_* → idle`.

Still to draw: `inspect`, `react`, and any future one-shots (scan, error, publish). Each
arrives as its own entry with its own measured geometry.

**Superseded** (do not regenerate against this): the design bible's original single-file
contract was `spawncamper_9000.png`, 48x64 frames, 8x6 grid, 384x384, 37 used frames,
origin 24,60, shadow baked in. The real Sprite Fusion exports do not use that grid.

## L5 · reusable effects (tinted at runtime)

| file | size | frames | fps | notes |
| --- | --- | --- | --- | --- |
| `fx_packet.png` | 8x8 | 4 | 12 | five tints, all routes |
| `fx_pulse_glow.png` | 32x32 | 6 | 10 | |
| `fx_scan_sweep.png` | 64x16 | 8 | 12 | |
| `fx_beam_uplink.png` | 8x64 | 6 | 12 | tiled vertically to 276px |
| `fx_success_flash.png` | 48x32 | 3 | 10 | one-shot |
| `fx_warning_lamp.png` | 12x12 | 2 | 4 | |
| `fx_glitch_band.png` | 128x40 | 4 | 12 | one-shot, any screen |
| `fx_spark.png` | 16x16 | 5 | 16 | one-shot |
| `fx_local_glow.png` | 128x128 | 1 | — | additive, scaled per zone |

## L6 · foreground / occlusion

`fore_ops_console_front.png` 192x14 · `fore_code_bench_front.png` 168x14 ·
`fore_x_console_front.png` 144x14 · `fore_tx_front.png` 168x14 ·
`fore_furnace_lip.png` 120x14 · `fore_still_base.png` 72x14 ·
`fore_pilaster_l.png` / `fore_pilaster_r.png` 24x408 · `fore_wall_port.png` 24x180

These are **not** the retired component overlays and are unaffected by that change. They
exist purely so SpawnCamper can walk *behind* a machine — depth, not animation. They keep
their own `art` paths in `COMMAND_CENTER_FOREGROUND` (`sceneConfig.mjs`), their own loader
seam, and their own layer above the character. Keep producing them where a machine needs a
front lip. A full animated machine sheet still gets a `fore_*` piece if the camper should
pass in front of part of it.

Generation prompts, the palette block and the constraint block live in
`docs/command-center.md`. The character reference render is in
`assets/command-center/reference/` and must not be shipped as a scene texture.

## Legacy · superseded component-overlay contract

**Do not generate against this.** The original design bible built an animated machine from
a static prop plus one or more hand-extracted animated component overlays —
`prop_radar_drum.png` + `anim_radar_sweep.png`, `prop_still_column.png` +
`anim_still_chamber.png` + `anim_still_coil.png`, `prop_x_console.png` + `anim_x_crt.png` +
`anim_x_lamps.png`, and so on. That required manually isolating every moving subcomponent,
which Sprite Fusion does not produce and which nobody needs to do by hand.

No shipped asset ever used it: the runtime path that composited these was removed, and the
production contract is now the two modes at the top of this file. The `docs/command-center.md`
L3 component spec is superseded on the same terms.

The `anim_*` keys survive in `COMMAND_CENTER_COMPONENTS` (`src/command-center/sceneConfig.mjs`)
as **procedural whitebox development visuals only** — the screens, LEDs, sweeps, coils and
fans the scene draws with Phaser shapes while a machine has no real art. They are never
painted over finished art: a machine's registry entry lists them in `coversComponents` and
they are not built at all once its asset loads.

One consequence worth knowing: `anim_ops_screens`, `anim_code_scroll`, `anim_x_crt` and
`anim_tx_crt` currently render live telemetry text into the room. That in-world text goes
away when their machine's real art lands, which is intended — real art is not overpainted.
Telemetry itself, the API, the zone inspector and the camper badge are unaffected.

The superseded sizing table, kept for reference:

| file | size | frames | fps | notes |
| --- | --- | --- | --- | --- |
| `anim_ops_screens.png` | 3 x (40x26) | 4 | 6 | one sheet row per screen |
| `anim_keyboard_leds.png` | 28x6 | 4 | 8 | |
| `anim_radar_sweep.png` | 72x72 | 8 | 12 | rotational, reuse anywhere circular |
| `anim_feed_cycle.png` | 44x30 | 6 | 4 | reused x4 with frame offset |
| `anim_scan_bar.png` | 144x16 | 8 | 12 | |
| `anim_code_scroll.png` | 120x34 | 8 | 6 | |
| `anim_disk_reel.png` | 24x24 | 4 | 8 | |
| `anim_still_chamber.png` | 48x108 | 10 | 8 | fill level, also usable one-shot |
| `anim_still_coil.png` | 24x24 | 6 | 10 | |
| `anim_tray_print.png` | 48x20 | 6 | 8 | |
| `anim_x_crt.png` | 64x38 | 6 | 6 | |
| `anim_x_lamps.png` | 44x38 | 4 | 6 | |
| `anim_tx_crt.png` | 96x60 | 6 | 6 | |
| `anim_tx_charge.png` | 36x36 | 8 | 10 | one-shot + hold |
| `anim_rack_leds.png` | 56x104 | 6 | 8 | reused for both racks, offset |
| `anim_fan.png` | 34x34 | 4 | 16 | reused x2 |
| `anim_furnace_heat.png` | 96x38 | 6 | 6 | |
| `anim_core_pulse.png` | 120x72 | 8 | 6 | |
| `anim_core_sigil.png` | 48x36 | 16 | 4 | slow rotation, ambient only |
