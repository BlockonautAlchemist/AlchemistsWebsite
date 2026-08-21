# Command Center art drop

Generated pixel art goes here. The scene ships as the design's scale-true whitebox and
swaps to art **per file**, so this directory can fill up one asset at a time.

## How the swap works

1. Drop the PNG in this directory under exactly the filename below.
2. Add that path to `manifest.json`:

   ```json
   { "files": ["/assets/command-center/prop_radar_drum.png"] }
   ```

3. Reload. `CommandCenterScene.preload()` queues only manifest-listed files, so an
   empty manifest makes zero failed requests and every unlisted prop keeps its
   whitebox. No coordinates change — each file lands in the rectangle its whitebox
   already occupies (`COMMAND_CENTER_PROPS` / `COMMAND_CENTER_COMPONENTS` /
   `COMMAND_CENTER_FOREGROUND` in `src/command-center/sceneConfig.mjs`).

All files are transparent PNGs with a bottom-centre origin and hard pixel edges,
except `env_floor_wall.png` which is opaque. No semi-transparent anti-aliasing on L2
edges or the 3/4 overlap seams show.

## L1 · environment (opaque)

| file | size | notes |
| --- | --- | --- |
| `env_floor_wall.png` | 960x528 | single image, zero props, zero characters |
| `env_conduit_channels.png` | 960x528 | alpha, dark channel inlays only, no glow |

## L2 · static props

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

## L3 · animated components (sheets, loop unless noted)

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

## L4 · character

`spawncamper_9000.png` — 48x64 frames, 8x6 grid, 384x384, 37 used frames.
Row 1 `idle` 6f 8fps · row 2 `hover_travel` front 8f 12fps · row 3 `hover_travel` back
8f 12fps · row 4 `operate` 6f 10fps · row 5 `inspect` 4f 6fps · row 6 `react` 5f 10fps
one-shot. Origin 24,60. Shadow baked into the frame (32x8 ellipse, 60% `#0d0214`).

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

Generation prompts, the palette block and the constraint block live in
`docs/command-center.md`. The character reference render is in
`assets/command-center/reference/` and must not be shipped as a scene texture.
