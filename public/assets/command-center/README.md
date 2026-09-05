# Command Center art drop

Generated pixel art goes here. The scene ships as the design's scale-true whitebox and
swaps to art **per file**, so this directory can fill up one asset at a time.

## Current runtime geometry

The production-hardening geometry and recovery rules in `docs/command-center.md` supersede the historical layout-pass notes below. All frames are recorded in `src/command-center/assetMeasurements.json`. The current Creator Console replacement is **1600×200**, eight **200×200** frames, a 136px opaque width and 32px bottom slack. Its floor contact remains (132,264), with its operating point at (132,276). The Tool Scanner replacement is also **1600×200**, eight **200×200** frames, with a 104px opaque width and 20px bottom slack; it renders approximately x264-368, y102-264 and keeps its floor contact at (316,264) and operating point at (316,276). The Opportunity Radar replacement is now **1600×200**, eight **200×200** frames, 88px wide with 32px bottom slack; it renders x616-704, y128-264 and keeps its station at (660,276). The relocated X Uplink replacement is likewise **1600×200** with 200×200 frames, 148px art width and 36px bottom slack; it renders x406-554, y365-494 and uses (480,502) as its clear front position. The measured west corridor is X=241; Zone 2 stands at (164,180).

## Machine → Hermes workflow mapping

This is semantic mapping only. Coordinates stay in `src/command-center/sceneConfig.mjs`,
and production art stays in `src/command-center/propSheets.mjs`.

| machine | Hermes job(s) | workflow/lane | purpose | pixel-art visual description |
| --- | --- | --- | --- | --- |
| News Array | AI News | `ai-news` | AI gaming news intelligence | Shallow horizontal wall display, cycling CRT cells, cyan packets |
| Repo Forge | GitHub | `github` | Repository and code-signal watch | Green code bench, phosphor terminal, disk tower |
| Tool Scanner | New Tools | `new-tools` | New AI/game-dev tool discovery | Long scanner bench, cyan scan bar, ready lamp |
| Agent Lab | Agents | `agents` | Agent workflow and automation review | Wall-mounted lab cabinet, lit central incubation chamber |
| Model Furnace | Models Infra | `models-infra` | Model routing and infrastructure evaluation | Twin racks feeding a heated processing chamber |
| Creator Console | Creator Content | `creator-content` | Creator-facing intelligence angles | Floor console, three-cell editorial CRT row, signal traffic |
| Profit Analyzer | Monetization | `monetization` | Monetization and partner opportunity review | Floor console, gold analysis CRT row, warmer pulses |
| Experiment Bench | Playbooks | `playbooks` | Playbooks and repeatable experiments | Wooden alchemist bench, potions and books, glowing magical circle, spell effects |
| Newsletter Still | Newsletter, Finisher | `newsletter` | Longer-form newsletter distillation | Tall still column, coil, chamber fill, output tray |
| X Uplink | X Draft, X Publish, X Amplify | `social-x` | Public X formatting and transmission | Communications console, transport CRT, antenna mast |
| Publish Transmitter | Beehiiv Draft | `terminal-publisher` | Terminal/Beehiiv publish handoff | Heavy transmitter cabinet, large CRT, charge meter |
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
no animated overlay rendered above it. Both modes use the same ground-baseline depth rule and placement path.

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
   { "files": ["/assets/command-center/anim_opportunity_radar_sheet.png"] }
   ```

3. Add (or edit) its entry in the art registry,
   `src/command-center/propSheets.mjs` — see the two examples below.
4. Run `npm run command-center:measure` and validate station geometry, foot clearance and screen surfaces.
5. Reload. `CommandCenterScene.preload()` queues only manifest-listed files, so an
   empty manifest makes zero failed requests and every unlisted machine keeps its
   whitebox.

**No coordinates live in the registry.** `src/command-center/sceneConfig.mjs` stays
authoritative for machine geometry: the registry names the prop key it covers and the
scene anchors the file **bottom-centre** on that box (`x + w/2`, `y + h`, origin `0.5, 1`
— the same rule SpawnCamper uses). A Sprite Fusion export that came out taller or wider
than the whitebox therefore grows upward and outward from the same floor contact point
instead of sliding off its station. `offsetX` / `offsetY` / `originX` / `originY` /
`scale` overrides exist in the registry for an awkward export.

Three further knobs are data, not fudges, and are all measured or deliberate:

| knob | what it is |
| --- | --- |
| `flipX` | render the art mirrored. The PNG is never touched — an export that reads the wrong way round is turned around in the registry, not re-mirrored on disk. Safe only because every sheet is centred in its cell, so the mirror happens about the machine's own centre and the floor contact point does not move. |
| `shadowWidth` | the art's real opaque width, measured off the PNG, which sizes the generated contact shadow. |
| `groundShadow` | `false` for wall-mounted art, which stands on nothing and must not pool a shadow on the floor below it. |

**Creator Console and Repo Forge ship `flipX: true`.** Both exports faced away from the
lane the camper approaches on. If either is ever re-exported already mirrored, drop the
flag rather than flipping twice — and re-check the centring test, which is what makes the
flip a pure mirror in the first place.

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
  offsetY: 50,
  shadowWidth: 168,
  covers: Object.freeze(['prop_ops_console']),
  coversComponents: Object.freeze(['anim_ops_desk_screens', 'anim_keyboard_leds', 'anim_ops_caret'])
})
```

A static prop is a **complete machine that has nothing moving in it**, not a lesser kind of
asset. It rides the same manifest seam, retires its whitebox body and every component in
`coversComponents` the same way, is anchored bottom-centre off the same `sceneConfig` box, is
pinned to NEAREST by the same pass, casts the same generated contact shadow, and carries the same
two measured numbers — `offsetY` and `shadowWidth` — off the same real pixels. The only
differences are that it loads through `loader.image` rather than `loader.spritesheet` and that
`propPlaybackFor` returns `null` for it, so attendance never starts anything.

### Shipped static props

| file | file size | drawn content | `offsetY` | `shadowWidth` | anchors on |
| --- | --- | --- | --- | --- | --- |
| `prop_ops_console.png` | 201x203 | 168x104 at x 16-183, y 49-152 | 50 | 168 | `prop_ops_console` |
| `prop_wall_sigil.png` | 64x64 | 47x62 at x 8-54, y 1-62 | 1 | none (wall art) | `prop_wall_sigil` |

The **wall sigil** is the second, and it separates two axes that had been travelling together.
Every static prop before it stood on the floor and pooled a shadow; every piece of wall art
before it was an animated sheet. The sigil is static *and* wall-mounted, so it takes
`groundShadow: false` and records **no `shadowWidth`**, exactly as the News Array and Agent Lab
sheets do. Static vs animated and floor vs wall are independent, and the registry now has an
entry in each corner it needs.

The export is the gold Alchemists **`A`**, 47x62 of real pixels in a 64x64 cell, with one empty
row under the glyph — so `offsetY: 1` puts its last opaque row back on the box's bottom edge at
y86. It lands x614-661, y24-86: seated on its own 52x52 slot, level at the top with the GA//OPS
bank beside it, and wholly inside the 120px wall band. Content sits at x31.5 against a cell
centre of 32.0, which is inside the same 0.5px tolerance the mirrored sheets are held to, so it
needs no `offsetX` or origin override. Every pixel it draws is fully opaque against fully
transparent ground — no baked plate, no anti-aliased fringe — and a test asserts that census so
a re-encode with smoothing on fails here instead of hazing on the wall.

Art pass 6, and the first static prop to ship. The export is a **throne-style command console**:
two wing desks, a central seat recess, an overhead arch and every lit readout on it, all in one
transparent PNG. Nothing is composited on top of it, so the whitebox desk and all three of
`anim_ops_desk_screens`, `anim_keyboard_leds` and `anim_ops_caret` retire with it.

The cell is the same 201x203 Sprite Fusion shape the News Array uses, and it behaves the same
way: 50 empty rows sit **under** the console feet, so `offsetY: 50` puts the last opaque row back
on `prop_ops_console`'s bottom edge at y216 — the floor line the generated pool is drawn on and
the point conduit `D3` starts from. Content is centred to within 0.5px of the cell centre, so no
origin or `offsetX` override, and a static prop never flips.

The sizes below are the **whitebox box** each machine occupies in `sceneConfig.mjs`, which
is what the art is anchored to. They are a target, not a constraint: the real export
governs, and an export that differs still lands bottom-centre on the same box.

These are the machines **still awaiting art**; each keeps its procedural whitebox until its
file ships. Machines already drawn are listed under *shipped animated machines* below and
have no `prop_<name>.png` deliverable at all — an animated sheet replaces it outright.

| file | size | zone |
| --- | --- | --- |
| `prop_wall_crt_bank.png` | 216x84 | 01, wall-mounted |

Art pass 2 removed five rows from this table. `prop_creator_console.png`, `prop_code_bench.png`,
`prop_disk_tower.png`, `prop_rack.png` and `prop_furnace_chamber.png` are **no longer
deliverables at all** — the Creator Console, Repo Forge and Model Furnace sheets are the whole
of those machines, disk tower and both racks included. Do not produce them.

The whitebox cleanup pass removed the rest by deleting the props themselves.
`prop_wall_receptacle.png`, `prop_crate_wide.png` and `prop_wall_vents.png` are **no longer
deliverables — do not produce them.** The wall receptacle, both wide crates and the
three-louvre vent bank were blank whitebox filler with no Hermes job and no zone behind
them; they were deleted from `COMMAND_CENTER_PROPS` and from the registry together rather
than left waiting on art. `prop_wall_sigil.png` was the one exception — kept as a deliverable
because the gold `A` emblem is intentional dressing rather than filler — and it has **since
shipped**; see *Shipped static props* above. `prop_wall_crt_bank.png` is now the only file this
directory is still waiting on.

Art pass 3 removed three more. `prop_profit_analyzer.png`, `prop_tx_body.png` and
`prop_wall_feed_shells.png` are **no longer deliverables either** — the Profit Analyzer,
Publish Transmitter and News Array sheets are the whole of those machines.

Art pass 4 removed the last one. **`prop_core_well.png` is not a deliverable and must never
be produced.** The Power Core was scenery — a recessed well in the middle of the room with no
Hermes job behind it and no machine mapped to its zone — and it was **removed from the room
entirely** in art pass 4, body, components and zone identity together. The Experiment Bench
took its floor pocket.

Art pass 6 shipped `prop_ops_console.png` — see *shipped static props* above — so **one** static
prop deliverable is left, and it is the single row above.

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
* A machine is **still by default**. It holds `staticFrame` — the first frame of its own
  sheet unless the entry overrides it — and only runs while **SpawnCamper is working at
  it**: the loop starts on the frame his walk ends at that zone's `destination`, and stops
  again the moment he steps away. One machine at a time, so motion in the room means he is
  standing there, not that telemetry is busy. Two or more live workflows still light their
  zones' glow, lamps and packets; only the machine he is attending actually moves.
  Authoring is unaffected — export the loop as if it ran forever, and design frame 0 to be
  a presentable resting pose, because that is the frame the machine is seen in most of the
  time.
* The loop is still **registered once at build time** and never re-issued on an update
  tick; what changes at runtime is only whether it is playing. The seam is
  `setCamperStation` in `CommandCenterScene.mjs` — the single place machine playback is
  touched after build.
* Under `prefers-reduced-motion` the sprite holds that **same frame out of the same sheet**
  permanently, attended or not. No second, static PNG is ever required as an animation
  fallback.
* The procedural whitebox components (radar sweep, scan bar, coil, fan) follow the
  identical rule, so a machine still on the fallback and a machine with finished art behave
  the same way.
* A machine's real asset — static or animated — retires the whitebox components listed in
  its `coversComponents`, because a real machine is already complete.

```js
// src/command-center/propSheets.mjs — measured off the real PNG, not copied from here
Object.freeze({
  id: 'radar_drum',
  type: PROP_ANIMATED,
  art: `${ART_ROOT}/anim_opportunity_radar_sheet.png`,
  textureKey: 'anim_opportunity_radar',
  sheetWidth: 544, sheetHeight: 68,
  frameWidth: 68, frameHeight: 68, frames: 8, fps: 8, repeat: -1,
  covers: Object.freeze(['prop_radar_drum']),
  coversComponents: Object.freeze(['anim_radar_sweep'])
})
```

Sheet layout matches the character contract: a single horizontal row, zero margin, zero
spacing, RGBA8, non-interlaced, binary alpha, so NEAREST never interpolates an edge.

### Shipped animated machines

Measured off the PNGs themselves — each file was decoded and its alpha walked per frame.
All twelve are one horizontal strip, binary alpha, zero margin, zero spacing, and every
frame's content is horizontally centred in its cell to within 0.5px, so none needs an origin
or scale override. That centring is also what makes `flipX` safe — a mirror about a centred
origin leaves the machine on the same floor spot — and a test holds it there.

The invariant that actually holds is `frameHeight == sheetHeight`, **not** squareness: the
Repo Forge cell is 203x202, the Model Furnace cell 202x203 and the Publish Transmitter cell
149x144. Do not assume square cells; measure.

Twelve carry a vertical offset, and it is always the same measurement — the empty rows the
Sprite Fusion cell leaves **under the machine's contact edge**, identical in all 8 frames.
`offsetY` equals that slack exactly, which puts the last opaque row back on the bottom edge
of the whitebox box. Without it the machine floats that far above its station.

| entry | bottom slack | `offsetY` |
| --- | --- | --- |
| Opportunity Radar | 32 rows of a 200px cell | 32 |
| Profit Analyzer | 19 rows of a 197px cell | 19 |
| Agent Lab | 20 rows of a 202px cell | 20 |
| Tool Scanner | 20 rows of a 200px cell | 20 |
| X Uplink | 36 rows of a 200px cell | 36 |
| Newsletter Still | 21 rows of a 203px cell | 21 |
| Creator Console | 32 rows of a 200px cell | 32 |
| Repo Forge | 29 rows of a 202px cell | 29 |
| Publish Transmitter | 32 rows of a 144px cell | 32 |
| Model Furnace | 41 rows of a 203px cell | 41 |
| Experiment Bench | 57 rows of a 203px cell | 57 |
| News Array | 70 rows of a 204px cell | 70 |

News Array and Agent Lab are the wall-mounted sheets, so their contact edge is the bottom
edge of a wall box rather than a floor line. The nudge works identically: 70 rows down puts
News Array's last opaque row on `prop_wall_feed_shells`'s bottom edge at y=78, well inside
the 120px wall band, and 20 rows down puts the Agent Lab cabinet's last opaque row on
`prop_wall_agent_lab`'s bottom edge at y=180. The cabinet is 161px tall against a 120px wall
band, so it hangs past the wall/floor line by design — it casts no pool, and SpawnCamper
stands 12px below its base. These two are the only shipped sheets carrying
`groundShadow: false` and recording no `shadowWidth` — see *generated contact shadows* below.

| file | machine | zone | sheet | frames | frame | fps | loop | anchors on |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `anim_opportunity_radar_sheet.png` | Opportunity Radar | 13 | 1600x200 | 8 | 200x200 | 8 | 1.000s | `prop_radar_drum` |
| `anim_tool_scanner_sheet.png` | Tool Scanner | 03 | 1600x200 | 8 | 200x200 | 6 | 1.333s | `prop_scanner_bench` |
| `anim_newsletter_still_sheet.png` | Newsletter Still | 05 | 1624x203 | 8 | 203x203 | 6 | 1.333s | `prop_still_column` |
| `anim_x_uplink_sheet.png` | X Uplink | 06 | 1600x200 | 8 | 200x200 | 6 | 1.333s | `prop_x_console` |
| `anim_creator_console_sheet.png` | Creator Console | 10 | 1600x200 | 8 | 200x200 | 6 | 1.333s | `prop_creator_console` |
| `anim_repo_forge_sheet.png` | Repo Forge | 04 | 1624x202 | 8 | 203x202 | 6 | 1.333s | `prop_code_bench` |
| `anim_model_furnace_sheet.png` | Model Furnace | 08 | 1616x203 | 8 | 202x203 | 6 | 1.333s | `prop_furnace_chamber` |
| `anim_profit_analyzer_sheet.png` | Profit Analyzer | 11 | 1576x197 | 8 | 197x197 | 6 | 1.333s | `prop_profit_analyzer` |
| `anim_publish_transmitter_sheet.png` | Publish Transmitter | 07 | 1192x144 | 8 | 149x144 | 6 | 1.333s | `prop_tx_body` |
| `anim_news_array_sheet.png` | News Array | 02 | 1608x204 | 8 | 201x204 | 6 | 1.333s | `prop_wall_feed_shells` (wall) |
| `anim_experiment_bench_sheet.png` | Experiment Bench | 09 | 1624x203 | 8 | 203x203 | 6 | 1.333s | `prop_experiment_bench` |
| `anim_agent_lab_sheet.png` | Agent Lab | 12 | 1624x202 | 8 | 203x202 | 6 | 1.333s | `prop_wall_agent_lab` (wall) |

The `loop` column is the cycle length **while SpawnCamper is working at that machine**.
None of the twelve overrides `staticFrame`, so all twelve rest on frame 0 of their own sheet
whenever he is not — which is most of the time, and the reason frame 0 should read as a
powered-but-idle pose rather than a mid-motion pose.

Attendance is per **zone**, not per machine. Zone 02 was for a while the one zone that owned
two finished machines — News Array on the wall and the Opportunity Radar on the floor below it
— and standing there ran both. That seam still exists, but nothing uses it today: when the
radar swapped columns with the Creator Console it was carved out into zone 13, so **every zone
now owns exactly one machine** and attending one runs only that one.

### Generated contact shadows

**Machine art bakes no shadow, and must not.** One file is anchored by the registry, and a
shadow baked into the sprite would be locked to whatever floor it was drawn against. The
scene generates the pool instead: `addPropShadow` tints the same 128x128 radial the zone
glows use, squashes it flat, and draws it at `DEPTH.props - 1` — under every machine, in a
single pass before any art is drawn, so no pool ever lands on top of a neighbour.

Two numbers shape it, both derived, neither authored:

- **where** — `box.y + box.h`, the box's bottom edge. That is the art's real floor contact
  for every shipped sheet, and not by luck: `offsetY` is exactly the empty rows *under* the
  machine, so nudging the sprite down by the slack puts its last opaque row back on that
  edge.
- **how wide** — `shadowWidth`, the measured art width, falling back to the whitebox
  footprint when nothing is recorded. The box is a floor plan, not an outline, and the two
  routinely disagree: the Tool Scanner's 104px bench sits in a 168px box, the Model Furnace's
  165px assembly anchors on a 120px chamber. Sizing off the box would have put a 168px pool
  under a 104px machine.

The generated radial fades to nothing at its own edge, so the drawn pool is 1.4x the art
width — that puts the machine's outline at roughly the gradient's 0.72 stop, where it is
still visibly dark — squashed to 0.22 of that and floored at 18px so small machines do not
get a pool thin enough to read as a line.

| machine | measured art width | pool |
| --- | --- | --- |
| Opportunity Radar | 88 | 123.2 x 27.1 |
| Tool Scanner | 104 | 145.6 x 32 |
| X Uplink | 148 | 207.2 x 45.6 |
| Newsletter Still | 98 | 137.2 x 30.2 |
| Creator Console | 123 | 172.2 x 37.9 |
| Repo Forge | 163 | 228.2 x 50.2 |
| Model Furnace | 165 | 231 x 50.8 |
| Publish Transmitter | 85 | 119 x 26.2 |
| Profit Analyzer | 133 | 186.2 x 41 |
| Ops Console | 168 | 235.2 x 51.7 |

**Wall art casts none.** `groundShadow: false` opts an entry out entirely, because a display
bolted to the wall stands on nothing and a pool on the floor beneath it would be a shadow
with no caster. Those entries record no `shadowWidth` either — an unread number is a number
that drifts. News Array and Agent Lab are the *animated* entries in that category;
`prop_wall_sigil` is the static one that ships and `prop_wall_crt_bank` the static one still
awaiting art — the wall receptacle and the vent bank were also in this list until the cleanup
pass deleted both outright. The Ops
Console is the counter-example that proves the pool is not an animated-only feature: it is a
static prop, it stands on the floor, and it pools exactly like a sheet does. A test
asserts every `groundShadow: false` entry is really wall art — which is why those entry ids
all begin `wall_`.

Whitebox bodies are untouched by this: they keep their own `shadow: 4` offset-rectangle
fill, which is the development fallback's look and not the shipped one.

The X Uplink export bakes the antenna mast into the console, so its single entry covers
**both** `prop_x_console` (the anchor) and `prop_x_mast`, plus all three of their
components. There is deliberately no separate `x_mast` registry entry: a prop claimed by
two entries breaks the one-machine-one-owner rule the tests enforce.

The Newsletter Still is the same shape of case. Its sheet is the entire machine — tall
chamber, liquid, coil, gauge, indicator lights and the lower output tray, all animating in
frame — so its single entry covers **both** `prop_still_column` (the anchor) and
`prop_still_tray`, and retires all three of `anim_still_chamber`, `anim_still_coil` and
`anim_tray_print`. There is no `still_tray` entry. One physical machine represents both
newsletter stages, `AI Informer · 09 Daily Newsletter` and
`AI Informer · 09b Newsletter Finisher`; it is never split into two machines.

Repo Forge and Model Furnace are two more of the same shape of case, and both were folded
in the same way. The Repo Forge export is the whole workstation — bench, phosphor terminal
**and** the disk tower beside it — so its single entry covers both `prop_code_bench` (the
anchor) and `prop_disk_tower`, and retires `anim_code_scroll`, `anim_code_leds` and
`anim_disk_reel`. The Model Furnace export is the complete assembly — chamber, heat gauge
**and both flanking racks** — so its single entry covers all three of
`prop_furnace_chamber` (the anchor), `prop_rack_a` and `prop_rack_b`, and retires
`anim_furnace_heat`, `anim_rack_leds` and `anim_fan`. There are no `disk_tower`, `rack_a` or
`rack_b` registry entries any more; a second entry per body would claim a prop twice and
leave a duplicate whitebox rendering under the real machine.

The furnace anchors on the **chamber**, not on a rack. `covers[0]` is the box the art's
floor contact lands on, and the assembly stands on the chamber's bottom edge — anchoring it
on `prop_rack_a` would hang the whole machine 96px up the wall. `machineConfig.mjs` orders
`model-furnace`'s `propKeys` the same way for the same reason.

Removing both rack entries also removed the registry's original one-file-two-instances
example. The **wide crates** inherited that role for a while (`prop_crate_wide.png` at
`prop_crate_wide_a` and `prop_crate_wide_b`), and the cleanup pass deleted both. **No entry
shares a texture key with another today.** The dedup guard in `propsToPreload` stays — it is
loader hygiene, not a crate special case, and one file at two anchors is still a legal
registry shape — but the test now asserts texture-key uniqueness instead of pointing at a
pair that no longer exists.

`prop_crate_small` (24x24 @ 300,180) was **deleted** in this pass. It was harmless decoration
while the Creator Console was a 120x72 whitebox, but the real 123x109 art covers x 262-386,
y 167-276 and swallows the crate whole. It was removed from `COMMAND_CENTER_PROPS` and from
the registry together — a box present in one but not the other fails the
every-prop-is-described invariant in either direction.

> **The per-pass tables below record each sheet as it was measured on the day it shipped.**
> The rendered *sizes* in them are still correct — no art has been regenerated — but the
> *positions* were superseded by the floor-layout normalization pass. For where every machine
> stands today, read **Floor layout — the normalization pass** further down; it is the current
> record and the two must not be read as disagreeing.

Known geometry consequences, kept here so the remaining sheets can be authored around
them: the radar, scanner and uplink exports are considerably narrower than their whitebox
boxes (68 vs 96, 72 vs 168, 64 vs 144) while heights line up, so the wide benches read as
compact consoles. The Newsletter Still runs the other way — 98x154 of drawn content inside
a 203px cell, against a 72x144 box — so it overhangs its box by ~13px each side and rises
10px above its top, and because it is centred on the column box the retired tray box at
x 348-408 is now bare floor. Zone hit rects are unchanged, so bare floor inside a zone
still selects it.

Art pass 2 adds three more, all the same kind of thing:

| machine | art occupies | against its boxes |
| --- | --- | --- |
| Creator Console | x 262-386, y 167-276 | overhangs the 120x72 box by ~1.5px each side and rises 37px above its top. **Rendered mirrored** (`flipX`) — the footprint is unchanged, the CRT row reads the other way. |
| Repo Forge | x 50-214, y 310-456 | covers the 168x72 bench well, but the retired disk-tower box at x 228-264 is now **bare floor**. **Rendered mirrored** (`flipX`) — the terminal and disk tower swap sides within the same footprint. |
| Model Furnace | x 745-909, y 237-360 | matches the combined rack width (744-912) almost exactly, but the retired rack boxes above y 237 are now **bare wall**, a ~93px band |

Both bare patches are the intended consequence of a full-assembly replacement and match the
Newsletter Still's retired tray box. If they ever want filling it is a job for the L1 shell
or new dressing props, not for reinstating a whitebox under finished art.

Art pass 3 adds the last three, measured the same way:

| machine | art occupies | against its boxes |
| --- | --- | --- |
| Profit Analyzer | x 623.5-756.5, y 151-312 | overhangs the 108x72 box (636-744) by ~12.5px each side and rises 89px above its top. Its footprint fully contained the decorative `prop_crate_wide_a` box (648-696, 168-192), which the cleanup pass deleted — see below |
| Publish Transmitter | x 737.5-822.5, y 376-456 | sits **inside** the 168x96 box (696-864), leaving ~41px of bare floor each side and 16px at the top. The Tool Scanner case again: the box is a floor plan, the cabinet is compact |
| News Array | x 71.5-254.5, y 13-78 | inset ~23px each side of the 232x38 wall strip (48-280) and rising 27px above its top, entirely inside the 120px wall band. No floor pool |

Two consequences of art pass 3 were **not** fixed, because geometry was out of scope for it
and both are cosmetic:

- `prop_crate_wide_a` (48x24 @ 648,168) sat inside the Profit Analyzer's art footprint. This
  was the `prop_crate_small` situation from art pass 2, and the **cleanup pass resolved it the
  same way**: the box came out of `COMMAND_CENTER_PROPS` and its `crate_wide_a` entry out of
  the registry, together. `prop_crate_wide_b` (48x24 @ 624,432) went with it — it stood on bare
  floor near the south lane and decorated nothing.
- Conduit `D8` (`transmitter → wall port`, x 864-936) starts ~41px clear of the transmitter
  art's right edge at x822.5, because the cabinet is narrower than the box the lane was drawn
  against. It also no longer terminates on anything drawn: `prop_wall_receptacle` (24x30 @
  912,378) was blank whitebox and the cleanup pass deleted it, so the lane runs into the wall
  shell — and `fore_wall_port` (912,120 24x180), which sat in a different band anyway, is retired
  along with the rest of L6. Routing, telemetry and the lane's triggers are unchanged.

Art pass 4 is one machine and one deletion:

| machine | art occupies | against its boxes |
| --- | --- | --- |
| Experiment Bench | x 416.5-543.5, y 270-360 | sits **inside** the 144x96 box (408-552), leaving ~8.5px of bare floor each side and 6px at the top. The Publish Transmitter case again: the box is a floor plan, the bench is compact |

It is the only shipped sheet whose art fits entirely within its box in both axes. Clearances
around it were checked against the real art of every neighbour: the Ops Console box's bottom
edge at y216 is 54px above it, the relocated X Uplink art begins at y365, five pixels below
the bench, the Profit Analyzer's art starts at x623.5 (80px clear) and the Creator Console's
ends at x385.5 (31px clear). Conduit `D4` (`spine → X console`, x477, y 294-431) crosses the bench's footprint —
it crossed the core well's identically before the swap, so nothing about that changed. `D3`
now stops 6px above the bench's top edge instead of on the well's rim; it kept its id,
geometry and triggers and only changed which zone owns it.

Two art-to-art seams are worth knowing about, both at the same `DEPTH.props` with no
y-sorting, so registry order decides: the Creator Console's right edge lands at x 385.5
against the Ops Console art's left edge at 395.5 (10px — art pass 6 opened this up from the
~1.5px it was against the box), and the Repo Forge's top edge at y 310 against the Tool
Scanner box's bottom at 312 (2px). Both were checked against the real art and read clean.

Art pass 6 is the room's first **static** shipped prop, measured the same way:

| machine | art occupies | against its boxes |
| --- | --- | --- |
| Ops Console | x 395.5-563.5, y 112-216 | sits **inside** the 192x72 box (384-576) horizontally, leaving ~12px each side, and rises 32px above its top. The console's bottom edge lands exactly on the box's bottom edge at y216, which is the floor line its pool is drawn on and the point conduit `D3` leaves from |

Clearances were checked against the real art of every neighbour: the **GA//OPS wall display**
(`prop_wall_crt_bank`, bottom edge y108) clears the console's top row at y112 by **4px** and is
fully preserved — it is a different machine, still unshipped, and it carries the `anim_ops_screens`
readout; the Creator Console's art ends at x385.5 (10px clear); the X Uplink mast box starts at
x576 (12.5px clear); the Experiment Bench's art starts at y270, 54px below the console's bottom
edge; and the zone 01 stencil at (390, 128) sits 5.5px left of the art. SpawnCamper's anchor
(480, 228) and his routing are untouched — he stands 12px south of the console's bottom edge, in
front of the throne opening, exactly where he stood in front of the whitebox desk.

`prop_ops_cable_stub` (24x8 @ 432,132) was **deleted** in this pass. It was a harmless dressing
bar while the Ops Console was a 72px whitebox desk it sat just above, but the real art rises to
y112 and the stub now lands in a transparent pocket of the console, reading as a panel floating
over the left wing desk. As with `prop_crate_small` in art pass 2 it was removed from
`COMMAND_CENTER_PROPS` **and** from the registry (`ops_cable_stub`) together — never one without
the other — and `prop_ops_cable_stub.png` is no longer a deliverable.

**Missing art is not an error.** If a file is absent, unlisted in `manifest.json`, or fails
to load, the machine keeps its procedural whitebox. The whitebox is the development
fallback and the only fallback — production art is never duplicated to provide one.

**One prop has no whitebox at all**, and it is the only one entitled to none. `prop_wall_sigil`
keeps its box in `sceneConfig.mjs` — that box is the anchor `covers[0]` resolves to, and the art
registry holds no coordinates by design — but its `parts` array is empty, so it draws nothing of
its own. Its whitebox used to be a 52x52 slab filled `0x1c0627`, stroked gold, with a `Russo One`
"A" set over it: a stand-in for a glyph nobody had drawn. Now that the emblem is a finished
transparent export there is nothing to fall back *to*, and a dark plate behind transparent art is
not a fallback, it is a plate behind the art. `part.glyph` and its text renderer left the scene
with that slab, the way `part.taper` left with the vent bank.

This is an allowlist of one (`WHITEBOXLESS_PROPS` in the test suite), not a rule that shipped
props may drop their parts — the Ops Console ships art and keeps its whitebox desk. Emptying a
prop's `parts` is a decision that has to be made deliberately, and the suite fails if any other
prop does it.

## Floor layout — the normalization pass

Everything above describes machines one sheet at a time. This section is the room.

Art anchors **bottom-centre** on its box, so for every shipped machine the rendered centre is
`box.x + box.w/2` and the rendered **foot** is `box.y + box.h`. That is the whole control
surface: the room is laid out by moving boxes and validated routes, while replacement art
uses its measured bounds and does not move the station boxes or destinations.

The layout pass was run against **measured opaque bounds** — every frame of every sheet
decoded and unioned, with `offsetY` and `flipX` applied — not against the whitebox boxes,
because the boxes are floor plans and the art routinely overflows them by 40-90px. Measuring
found two machines that were physically **overlapping** on screen and a third pair touching at
exactly 0px, none of which the box numbers showed:

| was | measured |
| --- | --- |
| Profit Analyzer vs Model Furnace | **11.5 x 75px of shared pixels** |
| Opportunity Radar vs Tool Scanner | historical **0px** contact before the current Tool Scanner replacement |
| Tool Scanner vs Repo Forge | historical **-2px** contact before the current Tool Scanner replacement |

### The grid

    columns (art centre x)    132 · 316 · 480 (fixed) · 660 · 828
    foot lines (art bottom)   264 back rank · 360 centre desk · 456 front rank

|  | C1 = 132 | C2 = 316 | C3 = 480 | C4 = 660 | C5 = 828 |
| --- | --- | --- | --- | --- | --- |
| **wall** | News Array | — | GA//OPS bank | Alchemists sigil (637.5) | Agent Lab |
| **foot 216** | | | **Central Ops** | | |
| **foot 264** | Creator Console | Tool Scanner | — | Opportunity Radar | — |
| **foot 336** | | | | | Model Furnace |
| **foot 360** | | | **Experiment Bench** | | |
| **foot 456** | Repo Forge | Newsletter Still | — | Profit Analyzer | Publish Transmitter |
| **foot 494** | | | **X Uplink (480)** | | |

Preserved outright, and the regression guard that the pass stayed in its lane: the News Array
wall strip, the GA//OPS display, the Alchemists emblem, the Agent Lab wall cabinet, Central
Ops as the room's centre, the Experiment Bench as the central alchemist desk, and the X Uplink.

### Where every machine stands now

| machine | whitebox box | drawn content | rendered bounds | centre / foot |
| --- | --- | --- | --- | --- |
| Creator Console | `72,192 120x72` | 123x109 | x 70.5-193.5, y 155-264 | 132 / 264 |
| Repo Forge | `48,384 168x72` | 163x146 | x 50.5-213.5, y 310-456 | 132 / 456 |
| News Array | `48,40 232x38` | 184x65 | x 71.5-255.5, y 13-78 | 163.5 / 78 |
| Newsletter Still | `280,312 72x144` | 98x154 | x 266.5-364.5, y 302-456 | 315.5 / 456 |
| Tool Scanner | `232,216 168x48` | 104x162 | x 264-368, y 102-264 | 316 / 264 |
| Central Ops | `384,144 192x72` | 168x104 | x 395.5-563.5, y 112-216 | 479.5 / 216 |
| Experiment Bench | `408,264 144x96` | 127x90 | x 416.5-543.5, y 270-360 | 480 / 360 |
| X Uplink | `408,422 144x72` | 148x128 | x 406-554, y 365-494 | 480 / 494 |
| Alchemists sigil | `612,34 52x52` | 47x62 | x 614-661, y 24-86 | 637.5 / 86 |
| Opportunity Radar | `612,192 96x72` | 88x136 | x 616-704, y 128-264 | 660 / 264 |
| Profit Analyzer | `606,384 108x72` | 133x161 | x 593.5-726.5, y 295-456 | 660 / 456 |
| Model Furnace | `768,264 120x72` | 165x123 | x 745-910, y 213-336 | 827.5 / 336 |
| Publish Transmitter | `744,360 168x96` | 85x80 | x 785.5-870.5, y 376-456 | 828 / 456 |
| Agent Lab | `786,20 92x160` | 91x161 | x 786.5-877.5, y 19-180 | 832 / 180 |

The ±0.5px on the Newsletter Still, Central Ops and Model Furnace is cell-centring in the
export, not a placement error: those three sheets are a half-pixel off centre in their own
frame. The Model Furnace's 165px art in a 202px cell lands x 745-910 rather than 745.5-910.5.

### The radar / console swap, and zone 13

After the normalization pass the **Opportunity Radar** and the **Creator Console** traded
columns — radar x132 → x660, console x660 → x132. Both were already on foot line 264, so the
move itself was two box `x` values and their two whitebox components.

What it was not, was a two-line change. **Zone 02 owned two machines**: the wall-mounted News
Array at x48-280 *and* the radar drum on the floor below it, sharing one `bounds` box, one hit
area and one walk anchor. That works only while both stand in the same corner. With the drum at
x633-687 the zone would have spanned x48-720, hung its label over empty floor, and kept a single
anchor that cannot stand in front of both — so the drum was carved out into **zone 13
`opportunity-radar`**, the same operation done for the Creator Console (10), the Profit
Analyzer (11) and the Agent Lab (12).

Zone 02 keeps its id, label, aliases and conduit; the `ai-news` workflow and the `researching`
/ `browsing` states still resolve to it. The radar carried its Hermes job (`254525fa846f`,
Opportunity Scout) and its deliberately empty workflow list into zone 13 unchanged. Because it
drives no workflow lane, **zone 13 sits idle unless that Hermes job fires** — already true of
the machine, now simply visible as a zone of its own.

Two anchors moved and no walk segment was added:

| zone | anchor | why |
| --- | --- | --- |
| 13 Opportunity Radar | (660, 276) | already the far end of the segment built for the Creator Console when it held this slot — renamed `creator-spur` → `radar-spur` |
| 10 Creator Console | (132, 276) | already the west end of `north-spur` |
| 02 News Array | (132, 276) → **(216, 276)** | 12px below a wall strip is still inside the wall band, so the anchor stays on the floor; x132 is the Creator Console's slot now, and leaving it there would have him work the News Array standing in front of another zone's machine. (216, 276) is under the east third of the display, 22.5px clear of the console art and 24px clear of west-lane, and lies **on** `north-spur`. **Superseded** — the operating-position pass moved it again, to (164, 132): staying on `north-spur` had left him 198px south of the machine he was working. See *The operating-position pass* |

Conduit `D1` moved with that anchor, x132 → **x216**. It had started exactly on the Creator
Console's foot, which read as the console's lane rather than the News Array's; at x216 it runs
on bare floor directly below zone 02's anchor, still under the same wall strip and still into
the spine. Its id, label, zone, colour, direction and triggers are unchanged.

`D5` was trimmed again, 144 → **108**. It is the only conduit drawn over the machines, and the
radar's growth reserve at x600-720 / y132-264 would have clipped it by 4px; at y0-108 it sits
entirely in the wall band and clears that reserve by 24px.

### Resulting clearances

| clearance | pair |
| --- | --- |
| 18.5px | Profit Analyzer ↔ Model Furnace |
| 31px | Opportunity Radar ↔ Profit Analyzer |
| 32px | Experiment Bench ↔ X Uplink |
| 33px | Model Furnace ↔ Agent Lab |
| 35.5px | X Uplink ↔ Profit Analyzer |
| 38px | Newsletter Still ↔ Tool Scanner |
| 40px | Model Furnace ↔ Publish Transmitter |
| 45.5px | Tool Scanner ↔ Central Ops |
| 46px | Creator Console ↔ Repo Forge |
| 50px | Experiment Bench ↔ Profit Analyzer |
| 50.5px | Central Ops ↔ Alchemists sigil |
| 52px | Newsletter Still ↔ Experiment Bench |
| 53px | Repo Forge ↔ Newsletter Still |
| 54px | Central Ops ↔ Experiment Bench |
| 58px | Opportunity Radar ↔ Model Furnace |
| 59px | Profit Analyzer ↔ Publish Transmitter |

Nothing overlaps. The tightest pair is 18.5px, against -11.5px and 0px before the pass.

### Growth reserve — Opportunity Radar

The Opportunity Radar now uses its native 1600x200 replacement sheet rather than the old
54x68 placeholder. Its measured x616-704 / y128-264 footprint remains on the same station
and keeps the (660,276) operating point. The wider lower footprint is clear of the centre
route through a short x575 detour; the agent approach likewise moves to x746. The Tool Scanner
continues to use its 1600x200 replacement sheet in the same 168x48 box; its measured art
occupies x264-368 / y102-264 and no longer relies on the growth reserve.

### The three off-grid exceptions

1. **Model Furnace, foot 336.** Its column is capped above by the Agent Lab cabinet, which
   hangs to y180, and below by the Publish Transmitter on the 456 rank — 276px of band for
   123px of art. Foot 336 centres it (33px above, 40px below). Foot 360 would align it with the
   Experiment Bench but leave **16px** to the transmitter, which would be the room's tightest
   gap.
2. **X Uplink, x480.** Its console moved beneath the Experiment Bench so the measured art
   occupies x406-554 / y365-494. The mast box moved with it to x528-576 / y314-422, and the
   screen/effect surface moved by the same (-48,+38) delta. The sheet remains native scale;
   its 36px cell slack puts the opaque foot on y494, so SpawnCamper uses the lowest clear
   front point at (480,502).
3. **Profit Analyzer / Model Furnace at 18.5px.** The east block is ~348px between the centre
   lane and the east wall and has to hold 133px + 165px of art plus a walk lane. Side by side
   at 30px is arithmetically impossible; they are stacked on different foot lines instead, so
   the gap reads as a corridor.

A fully uniform 3x5 grid is **not achievable** with these sheets and it is worth recording why:
heights run 62px to 161px, so on a 96px row pitch the six machines taller than 96px each
consume two row slots — 15 slots of demand against 13 available. The pass therefore locks the
column centres and the front foot line, which are the alignments the eye actually reads, and
lets the back rank carry only the machines that fit it.

### Boxes are still floor plans, not outlines

The pass moved boxes and deliberately did **not** resize them, so the art-vs-box mismatches
survive. Hit rects follow the box, so bare floor inside a zone still selects it — the same
rule that has applied since the first sheet shipped.

| box | size | art it carries | consequence |
| --- | --- | --- | --- |
| `prop_scanner_bench` 232,216 | 168x48 | 104x162 at x 264-368 | the art is 32px inset from the box on each side; the foot route detours through `scanner-clearance` around its lower footprint |
| `prop_tx_body` 744,360 | 168x96 | 85x80 at x 785.5-870.5 | ~41px of bare floor each side |
| `prop_still_column` 280,312 | 72x144 | 98x154 at x 266.5-364.5 | art overhangs ~13px each side, rises 10px above the box |
| `prop_profit_analyzer` 606,384 | 108x72 | 133x161 at x 593.5-726.5 | art overhangs ~12.5px each side, rises 89px above the box |
| `prop_furnace_chamber` 768,264 | 120x72 | 165x123 at x 745-910 | art spans the rack boxes, which moved with it |
| `prop_radar_drum` 84,192 | 96x72 | 54x68 at x 105-159 | art inset ~21px each side |

Tightening these to the measured footprints is a separate pass, and would touch the secondary
boxes (`prop_disk_tower`, `prop_still_tray`, `prop_x_mast`, `prop_rack_a`/`prop_rack_b`) too.

### Routing that moved with the room

Ids, labels, colours, directions, triggers and the `handoff`/`beam` flags are all unchanged;
only geometry moved, and every segment is still axis-aligned.

| lane / spur | change |
| --- | --- |
| `east-lane` | x 898 → **922** — x898 ran through the Model Furnace art, which reaches x910 |
| `south-lane` | split around the relocated X footprint, with west/east legs ending at x365 and starting at x595 |
| `centre-spur` | stays at x588 below the Radar band and detours through x575 from y240-276 for the wider native Radar footprint |
| `ops-spur`, `bench-spur` | far ends remain on `centre-spur` at x588; the (480,228) and (480,372) anchors do not move |
| `west-lane`, `scanner-clearance` | the larger Tool Scanner footprint splits west-lane at y228-272; X=409 provides a clear approach to its unchanged (316,276) destination |
| `res-spur` → `north-spur` | (132,276)→(588,276); one aisle serves the Creator Console and Tool Scanner anchors, with `scanner-clearance` approaching the scanner from the east |
| `profit-spur` → `profit-stub` | (660,468)→(660,490); the Profit Analyzer is a front-rank machine now, so it is reached from the south lane |
| `creator-spur` → `radar-spur` | (588,276)→(660,276), off `centre-spur` instead of `west-lane`. Renamed when the Opportunity Radar took that slot from the Creator Console |
| `newsletter-stub`, `tx-stub` | x 300 → 316, x 780 → 828 |
| `furnace-spur` | (828,348)→(922,348) |
| `agent-spur` | (832,192)→(832,348); zone 12's anchor is untouched, only the lane it lands on moved. **Superseded** — this is the geometry that put the spur through the Model Furnace; see *The operating-position pass* |
| conduit `SP` spine | y 246 → **288**, x 108-900, so it runs along the front edge of the back rank instead of under it |
| conduits `D1`,`D2`,`D4`,`D6`,`D7`,`D9` | re-pointed at their machines' new box edges; `D1` flips direction because its machines are now north of the spine, and later moved x132 → x216 in the swap |
| conduit `D5` | translated with the X station to x502, y383-431; its id, beam flag, color and trigger remain unchanged |
| conduits `D3`, `D8` | unchanged — `D8` now starts 6.5px off the transmitter cabinet instead of 41px |
| edge label "→ GA TERMINAL" | x 806 → **884**; the transmitter moved out from under it |

Every zone anchor still sits **south** of its machine, so one `operate_back` pose still serves
the whole room, and every route from the (480,228) home point is still axis-aligned.

### The operating-position pass

What the layout pass did **not** carry with the machines was four of their walk anchors. A
zone's `destination` is the single point SpawnCamper walks to and plays `operate_back` at, so
a machine that moves without its anchor is worked from wherever the anchor was left. The rule
the room already followed, now written down and asserted:

    destination.x = box.x + box.w / 2
    destination.y = max(box.y + box.h + 12, 132)

Art anchors bottom-centre, so `x + w/2` is the machine's rendered centre column and `y + h`
its floor contact line — the same two numbers the whole layout is built on. The `132` term is
the camper's own clamp in `moveCamperTo` and the top of `west-lane`: the northernmost floor
line he can stand on. It is a floor under the rule, not an exception to it, and it binds on
one zone.

| zone | was | now | gap from the drawn art |
| --- | --- | --- | --- |
| 02 News Array | (216, 276) | **(164, 132)** | 54 — see below |
| 05 Newsletter Still | (316, 480) | **(316, 468)** | 12 |
| 06 X Uplink | (528, 480) | **(480, 502)** | 8 — its replacement cell carries 36px of slack, so the art foot is 494 and the front route stays clear |
| 07 Publish Transmitter | (828, 480) | **(828, 468)** | 12 |

The other nine were already right and did not move: Central Ops stays centred at (480, 228)
in the throne opening, the Experiment Bench is still met from the front at (480, 372), and the
Agent Lab keeps (832, 192). Repo Forge, Newsletter Still, Profit Analyzer and Publish
Transmitter remain on the y468 front line; the relocated X Uplink uses its own y502 approach
below the measured art footprint.

**Zone 02 is the one zone the 12px gap cannot reach.** The News Array's foot is y78, inside
the 120px wall band, and the camper clamps to y ≥ 132, so `max(90, 132)` puts him on the
back-wall line at the closest the floor comes to the display. Raising him also returned him to
the display's own centre at x164: x216 had been a workaround for x132 being the Creator
Console's slot, and at y132 that no longer applies — the console's art starts at y155, 23px
below him, so neither he nor the leg that brings him there touches it. Conduit `D1` stays at
x216; a data-flow lane is not an operating position, and x216 is still the only clear column
between the console art and `west-lane`.

Reaching the corrected anchors cost three stub extensions, one lane extension, one re-routed
spur and one new segment:

| lane / spur | change |
| --- | --- |
| `newsletter-stub` | (316,480)–(316,490) → **(316,468)–(316,490)** |
| `south-access` | (410,384)–(410,490) → **(410,384)–(410,468)** |
| south lane | one segment through the X footprint → west/east segments at x365 and x595 |
| X clearance | **(365,490)–(365,468)–(595,468)–(595,502)** |
| `x-stub` | (528,468)–(528,490) → **(595,502)–(480,502)** |
| `tx-stub` | (828,480)–(828,490) → **(828,468)–(828,490)** |
| `east-lane` | y 300–492 → **y 192–492**, so `agent-spur` can leave it above the Model Furnace |
| `agent-spur` | (832,192)–(832,348) vertical → **(922,192)–(832,192) horizontal** — see below |
| `intel-stub` *(new)* | **(240,132)–(164,132)**, off `west-lane`'s existing top endpoint; it runs above the Creator Console art (top y155) |

**`agent-spur` was routing him through the Model Furnace.** It was vertical at x832 from the
wall down to `furnace-spur`, and that column was clear when it was drawn — the layout pass then
raised the furnace to y213–336 across x745–910, and the spur ran 123px straight down through
the middle of the machine. The box numbers never showed it, because the furnace's 165x123 of
art anchors on a 120x72 chamber box. It is horizontal now, leaving the extended `east-lane` at
x922 (12px clear of the furnace art's right edge at x910) and crossing above the furnace at
y192, which clears its top edge by 21px and the Agent Lab cabinet's foot by 12px. Zone 12's
anchor has not moved, and it is still one segment.

Two invariants in `test/command-center.test.js` now hold all of this: every zone anchor
matches the rule above, and **no walk segment or route leg intersects any machine's measured
art rect** — measured off the PNGs by the same decoder the sheet tables use, not off the
boxes, which is precisely why the furnace collision went unseen.

## Machine anchors — one machine, one primary box

Production art is one sprite per workflow machine, so each workflow machine owns one
**primary** whitebox box. A machine may still cover several boxes when they are genuinely
one physical object — the Model Furnace is a chamber plus two racks, the X Uplink a console
plus its mast, the Newsletter Still a column plus its tray — but unrelated machines must
not share a primary box just because the original whitebox did.

Two three-way collisions existed. The first is fixed:

| machine | was | now | zone |
| --- | --- | --- | --- |
| News Array | `prop_wall_feed_shells` | `prop_wall_feed_shells` (sole owner) — **art shipped** | 02, wall |
| Creator Console | `prop_wall_feed_shells` | `prop_creator_console` 120x72 @ 264,204 — **art shipped** | **10**, floor |
| Profit Analyzer | `prop_wall_feed_shells` | `prop_profit_analyzer` 108x72 @ 636,240 — **art shipped** | **11**, floor |

News Array keeps the wall strip because its art is deliberately a shallow horizontal
wall-mounted intelligence display, and the delivered sheet is exactly that: 184x65 of drawn
content hanging inside the wall band. The two consoles are floor-standing and got boxes that
describe an actual floor footprint and ground contact, because a 123x109 console cannot
hang off a 38px wall strip without falling off the top of the canvas.

Because a walk destination is per zone and not per machine, both consoles also needed their
own zone — while they lived in zone 02 SpawnCamper walked to the intel bench for them, which
was across the room from where they stand. Zones 10 and 11 were created for that, and both
moved again in the layout normalization pass. The Profit Analyzer settled at **(660, 468)**,
one vertical `profit-stub` off the south lane. The Creator Console went to the mid-east column
and then swapped back west with the Opportunity Radar, so it carries **(132, 276)**, the west
end of `north-spur`, and the mid-east segment it left behind was renamed `radar-spur`.
Workflow keys, Hermes job ids, telemetry state names and the API are unchanged through every
one of those moves — only which zone a machine physically occupies, and where that zone sits,
has ever changed.

The second three-way collision is now resolved outright:

| machine | was | now | zone |
| --- | --- | --- | --- |
| Tool Scanner | `prop_scanner_bench` | `prop_scanner_bench` (sole owner) — **art shipped** | 03, floor |
| Agent Lab | `prop_scanner_bench` | `prop_wall_agent_lab` 92x160 @ 786,20 — **art shipped** | **12**, wall |
| Experiment Bench | `prop_scanner_bench` | `prop_experiment_bench` 144x96 @ 408,264 — **art shipped** | **09**, floor |

Art pass 4 resolved Experiment Bench by **retiring the Power Core**. Zone 09 was a recessed
well in the middle of the room with no Hermes job behind it and no machine mapped to its
lane, so its group was permanently idle, its `anim_core_pulse` / `anim_core_sigil` /
`anim_core_seed` components were ambient-only and conduit `D3`'s operational branch could
never fire — scenery holding the best floor pocket in the facility while three real machines
shared one bench across the room. `prop_core_well`, those three components, the `core` and
`power` aliases and the Power Core's whitebox renderer paths were all deleted together, and
the Experiment Bench moved onto the same 144x96 box.

Because the box, the zone number and the walk anchor were reused verbatim, this move needed
**no walk-graph geometry at all** — the old `core-spur` was renamed `bench-spur` and nothing
else. He routes (480,228) → (622,228) → (622,372) → (480,372), axis-aligned, and stands 12px
south of the bench's bottom edge. Workflow keys, Hermes job ids and telemetry state names are
unchanged; only which zone the machine physically occupies moved.

Art pass 5 resolved Agent Lab the same way, against a cosmetic panel rather than a whole
retired machine. Its art is a **tall wall cabinet**, not a bench, so it took the middle
louvre of `prop_wall_vents` — three 64x70 tapered panels of unzoned dressing at 724,20, with
no Hermes job and no zone behind them. That louvre was deleted from the prop's `parts` and
the cabinet hung between the two survivors.

The **whitebox cleanup pass then deleted the whole bank**, box and registry entry together,
along with the `taper` renderer in `drawWhiteboxPart` that no other prop used. The cabinet now
hangs alone on bare `env_floor_wall.png` between x724 and x940. Its own box, anchor and
clearances are unchanged.

Why that slot and not another. The upper-right wall has only three candidate louvres, and
the other two are ruled out by real art, not by the whitebox:

- **left (724-788)** — the 91px cabinet would land x 710.5-801.5, into the Profit Analyzer's
  art, which rises to y 151. Clearing it would push a 161px-tall sheet off the top of the
  960x528 canvas.
- **right (876-940)** — the cabinet would land x 862.5-953.5, through `fore_wall_port`
  (912-936) and `fore_pilaster_r` (936-960). Both are retired now, so that band is bare wall art;
  the middle slot below was chosen on its own clearances and the decision is unchanged.
- **middle (800-864)** — the cabinet lands x 786.5-877.5, y 20-180, and it clears its
  neighbours by a wide margin in both directions. Those margins moved with the layout
  normalization pass: the Profit Analyzer left the far-east block for the mid-east column and
  now ends at x726.5 (60px clear), and the Model Furnace came up to y213 (33px clear). The
  floor pocket that used to sit beneath the cabinet is gone — the Model Furnace and the
  Publish Transmitter share that column now.

| machine | art occupies | against its boxes |
| --- | --- | --- |
| Agent Lab | x 786.5-877.5, y 20-180 | fills its own 92x160 box (786,20) to within 0.5px each side — the box **is** the art's footprint, because a wall-mounted machine has no floor plan to describe. No floor pool |

The cabinet is 161px tall against a 120px wall band, so it deliberately hangs past the
wall/floor line: it casts no shadow, which is what reads it as mounted rather than standing.

Because a walk destination is per zone and not per machine, Agent Lab also needed its own
zone — `agents` resolved to zone 03 and SpawnCamper walked to the scanner bench at (132, 324)
for it, right across the room. Zone 12 carries destination (832, 192): the box's centre, 12px
below its bottom edge, the same offset every floor console uses, so the one `operate_back`
pose serves it. **That anchor has never moved**, including through the layout normalization
pass — the cabinet is one of the preserved wall pieces.

Reaching it cost exactly **one** segment, `agent-spur`, and it still does — but not the one
it started as. It was vertical at x832, dropping from the wall onto the horizontal
`furnace-spur` so that `buildWalkGraph` derived the crossing node itself and no existing lane
needed editing. That was clear when it was drawn. The layout pass then raised the Model
Furnace into the same column — art x745–910, y213–336 — and the spur ran 123px straight down
through the middle of it, which the box numbers could not show because the furnace's 165x123
of art anchors on a 120x72 chamber box.

The operating-position pass turned it horizontal: `east-lane` was extended north to y192 and
the spur now runs (922, 192) → (832, 192), crossing above the furnace rather than through it —
21px clear of its top edge, 12px clear of the Agent Lab cabinet's foot, and 12px clear of the
furnace art's right edge at x910 on the way up. He routes
(480,228) → (578,228) → (578,490) → (922,490) → (922,348) → (922,192) → (832,192),
axis-aligned throughout, and zone 12's anchor is still untouched. Workflow keys, Hermes job
ids, telemetry state names and the API are unchanged — only which zone the machine physically
occupies moved.

Tool Scanner was untouched by all of this — same 168x48 bench, same replacement sheet, same components,
same zone 03 — and it is the only owner. The layout normalization pass later slid that bench
to 232,216 and its anchor to (316, 276), because at 48,264 its art touched the Opportunity
Radar's at exactly 0px and overlapped the Repo Forge's by 2px. Sheet, components, workflow key,
Hermes job and zone number are all still untouched.

**Nothing outstanding.** Every workflow machine in the room owns a primary box of its own.
`KNOWN_SHARED_ANCHORS` in `test/command-center.test.js` is empty and stays empty — the test
fails if any *new* collision appears, and the list may not be extended.

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

**No deliverables. The layer is empty.**

L6 is not the retired component-overlay system: it is a separate seam with its own `art` paths in
`COMMAND_CENTER_FOREGROUND` (`sceneConfig.mjs`), its own loader pass and its own layer above the
character. The seam stays. Its registry does not.

**Every machine-specific lip is retired.** A lip existed to hide the camper's legs behind a
whitebox desk; a finished machine already draws its own front, and L6 outranks L2 unconditionally,
so a surviving lip can only paint a flat block over real art. `fore_code_bench_front`,
`fore_furnace_lip`, `fore_still_base`, `fore_tx_front` and `fore_x_console_front` went with their
machines' art, and **`fore_ops_console_front` (192x14 @ 384,204) went with art pass 6** — it is
not a deliverable and must never be produced.

That one was checked both ways before it was dropped, because SpawnCamper stands directly in the
Ops Console's throne opening and an occluder there is not obviously wrong:

* **kept** — the piece has no PNG and never had one, so it can only render as its whitebox: a flat
  `0x20092c` bar. It erased the console's own plinth, base panel and gold feet across y204-216 and
  cut SpawnCamper's shins in half, leaving his feet reading as detached from his legs.
* **removed** — the console art already provides the front face down to y216, he stands cleanly in
  front of it framed by the arch, and head, torso, arms and legs all stay readable.

**The three structural pieces are retired too**, by the same rule one layer down:
`fore_pilaster_l.png` / `fore_pilaster_r.png` (24x408 @ 0,120 and 936,120) and
`fore_wall_port.png` (24x180 @ 912,120). None of them was ever produced, so each could only render
as its procedural whitebox — two dark `bg0` gradient strips down the room's edges and a solid
`0x1c0627` slab on the right wall — painted at `DEPTH.fore` over the finished
`env_floor_wall.png`, which draws its own wall edges and cable port. They were structural while L1
was a whitebox and had nothing left to occlude the moment it shipped. **They are not deliverables
and must never be produced.**

Nothing procedural is left in `buildForeground`: not the generic flat-rect fallback, which only
ever served the lips, and not the `pilaster-*` / `wall-port` renderers, which went with the strips.
L6 draws a real texture or it draws nothing — an untextured occluder over finished art is a block,
not an occluder. Do not add a piece here without a PNG behind it.

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
`anim_tx_crt` render live telemetry text into the room. That in-world text goes away when
their machine's real art lands, which is intended — real art is not overpainted. Three of
the four are now gone: `anim_x_crt` retired with the X Uplink sheet, `anim_code_scroll` with
the Repo Forge sheet in art pass 2, and `anim_tx_crt` with the Publish Transmitter sheet in
art pass 3. Only `anim_ops_screens` still renders it, until the Ops Console takes delivery.
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
