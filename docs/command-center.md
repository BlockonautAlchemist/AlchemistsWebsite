# SpawnCamper9000 Command Center

## Architecture

`/command-center` is a public read-only Vite page backed by two Vercel API endpoints:

- `POST /api/command-center/telemetry`: private authenticated ingest for SpawnCamper9000 and future agents.
- `GET /api/command-center/state`: sanitized public workflow state plus recent public history.

The frontend uses Phaser for a pixel facility floor. Its geometry, palette, layer
decomposition, animation language and asset specification come from the Claude Design
"SpawnCamper Command Center" bible (REV 01), authored by the site owner; section numbers
referenced throughout this document and in the source refer to that document.

Star Office UI concepts adapted here are scene/state separation, a fixed-size scene,
config-driven areas, a moving agent, state-driven animation modes, simultaneous workflow
activity, packet effects, polling/backoff, stale TTL fallback, and responsive canvas
framing. No Star Office UI artwork or third-party game art is included.

The scene currently ships as the design's **scale-true whitebox**: exact rectangles, exact
palette, exact animation timings, drawn procedurally. Every prop and animated component is
registered under the section 08 filename it is waiting for, so generated pixel art drops
into the same rectangle with no re-layout. See `public/assets/command-center/README.md`.

The implementation is deliberately config-driven:

- Room geometry, zones, props, animated components, foreground pieces, conduits, the walk
  graph, aliases and asset paths live in `src/command-center/sceneConfig.mjs`.
- Axis-aligned route finding over the walk graph lives in `src/command-center/walkGraph.mjs`.
- State-to-visual behavior lives in `src/command-center/visualMappings.mjs`.
- Public payload normalization, area grouping, deterministic focus selection, complete acknowledgement expiry, and stale handling live in `src/command-center/stateModel.mjs`.
- Polling/backoff/hidden-tab throttling lives in `src/command-center/telemetryClient.mjs`.
- Phaser rendering lives in `src/command-center/CommandCenterScene.mjs`.
- Star Office attribution and design provenance live in `THIRD_PARTY_NOTICES.md`.

### Geometry (section 01)

Scene `960x528`, grid `40x22` at `24px`, 3/4 top-down with no skew. Wall band rows 0-4
(`y 0-120`), floor rows 5-21, front walkway rows 20-21. Depth is `sprite.y + height`; all
origins are bottom-centre. Camera zoom is always an integer - a fractional world zoom kills
the pixel grid. Presentation scale is handled by CSS on the canvas element instead.

### Layers (section 02)

| layer | depth | contents | moves |
| --- | --- | --- | --- |
| L1 env | 0 | floor, wall, trim, stencils, conduit channels | no |
| L2 props | 10 | desks, drums, benches, racks, still body, console shells | no |
| L3 anim | 20 | screen content, LEDs, fans, radar, gauges, chamber fill, furnace heat | yes |
| L4 camper | 25 | SpawnCamper9000 | yes |
| L5 fx | 30 | packets, pulses, beam, spark, glitch, success flash, warning lamp | yes |
| L6 fore | 40 | desk fronts, chamber lip, pilasters, wall port, vignette | no |

Three rules hold the system together:

1. A machine is never one sprite. It is an L2 body plus L3 component(s) plus an optional L6 front.
2. If a pixel changes with telemetry it lives in L3 or L5. Never in L1 or L2.
3. Lighting that responds to state is an additive L5 overlay, not a repaint of L1.

### The telemetry seam (section 11)

Exactly one function in the scene reads telemetry:

```js
applyZoneState(zoneId, group)  // sets that zone's L3 anim keys, fx emitters and local glow
```

Ambient loops - fans, feed cycle, core pulse, sigil, idle CRTs, camper idle, and one slow
cyan spine packet every ~9s - run always, seeded with random phase offsets, and never
consult state. Operational loops - radar, scan bar, chamber, X CRT, transmitter charge,
packets, beam, success, warning, glitch - only run on real telemetry. **Never fake an
operational animation to fill silence. Idle is the design.**

`n` live workflows means `n` independent machine loops, because `applyZoneState` is
zone-scoped and `groupWorkflowsByArea` emits one group per zone. `selectFocusWorkflow`
picks the single zone the camper attends (attention, then transmission, then active, then
fresh complete); every other zone keeps running unattended.

The scene pauses on `document.visibilitychange`, so a tab left open overnight costs nothing.

### SpawnCamper9000 (section 03)

He never walks. The torso holds a fixed vertical bob and the tentacles trail behind the
direction of travel. Six modes, named for the sheet rows so `spawncamper_9000.png` swaps in
without remapping: `idle`, `hover_travel_front`, `hover_travel_back`, `operate`, `inspect`,
`react`. `visualMappings.mjs` maps every telemetry state onto one of them via `camperAnim`.

Movement follows the walk graph (4 lanes + 6 spurs, every segment axis-aligned), so no route
is ever diagonal and no diagonal cel is needed. On refresh he snaps to the newest live
workflow's anchor with no travel animation and machines resume mid-loop - no replayed history.

### Read-only inspection (section 06)

Clicking a machine or the character opens a 320px panel docked to the world edge nearest the
object, 24px inset, never centred, never modal, dismissed by any click outside or Escape. At
most six mono label/value rows, accent border in that zone's channel colour. The world never
pauses. There are **no controls of any kind**, no manual refresh, and no draft or unpublished
post content - only sanitized public fields.

Because a canvas is opaque to assistive technology, the same sanitized state is mirrored in a
visually hidden `aria-live` region (`#cc-area-body`, `#cc-recent-list`).

## Data Model

Migration: `migrations/20260820000000_create_command_center.sql`.

Tables:

- `command_center_events`: immutable public-safe event log.
- `command_center_workflow_state`: latest state per `agent + workflow`.

The storage layer uses `DATABASE_URL` with the existing Neon serverless pattern. `/api/terminal/signals` is unchanged and independent.

## Private Ingest API

Required environment variable:

```bash
COMMAND_CENTER_INGEST_SECRET=...
```

Accepted payload:

```json
{
  "eventId": "optional-stable-id-for-retries",
  "agent": "spawncamper9000",
  "workflow": "new-tools",
  "workflowLabel": "New Tools",
  "state": "researching",
  "activity": "Scanning AI gaming tools",
  "timestamp": "2026-08-20T16:03:00-04:00",
  "startedAt": "2026-08-20T16:03:00-04:00",
  "ttlSeconds": 900,
  "publicUrl": "https://x.com/example/status/123",
  "context": {
    "station": "scanner",
    "target": "AI gaming tools",
    "count": 12
  }
}
```

Required fields are `workflow`, `state`, and `activity`. The default agent is `spawncamper9000`. Unknown top-level fields and unknown `context` fields are rejected. Public text is control-character sanitized and length-limited. `publicUrl` must be `http` or `https` and cannot include credentials.

Valid states: `idle`, `researching`, `browsing`, `scanning`, `evaluating`, `thinking`, `writing`, `coding`, `processing`, `executing`, `publishing`, `posting_to_x`, `newsletter`, `terminal_publish`, `waiting`, `complete`, `warning`, `error`.

Security controls:

- Bearer auth using `COMMAND_CENTER_INGEST_SECRET`.
- Request body limit of 24KB.
- Strict allowlisted schema.
- Timestamp age and future-skew validation.
- Optional `eventId` dedupe per agent.
- Best-effort per-instance ingest rate limiting.
- Public endpoint never exposes raw prompts, drafts, stack traces, filesystem paths, headers, tokens, or raw logs.

## Public State API

`GET /api/command-center/state?historyLimit=30`

Returns:

- `workflows`: latest public-safe state per workflow.
- `recentHistory`: latest public-safe events.
- `fetchedAt`: server timestamp.

The frontend applies TTL fallback. When `expiresAt` has passed, a workflow is marked stale and visually falls back to idle so active states do not stay active forever. Heartbeat updates should arrive before `ttlSeconds` expires.

`complete` is treated as a brief visual acknowledgement. Fresh complete states animate in the affected area for 30 seconds, then visually return to idle unless another visible workflow is active.

SpawnCamper9000 focuses on one workflow using this deterministic priority:

1. Latest `error` or `warning`.
2. Latest transmission/publishing state: `terminal_publish`, `posting_to_x`, `newsletter`, or `publishing`.
3. Latest other active state.
4. Fresh `complete` acknowledgement.
5. Central Operations idle/home.

## Zone Register (design section "Zone Register")

| # | zone id | machine | anim | anchor |
| --- | --- | --- | --- | --- |
| 01 | `central-operations` | ops console + wall CRT array | 3 screens, keyboard LEDs | 480,228 |
| 02 | `intelligence-research` | radar drum + wall feed bank | radar sweep, 4 feeds | 132,324 |
| 03 | `scanner-bench` | New Tools / Agents bench | full-object sheet | 132,324 (shared) |
| 04 | `github-code` | green phosphor + disk tower | code scroll, 3 LEDs, reel | 132,468 |
| 05 | `newsletter` | distillation column + tray | chamber fill, coil, sheet | 300,480 |
| 06 | `x-communications` | console + mast + dish | CRT, 4 lamps, beam | 528,480 |
| 07 | `terminal-transmitter` | large CRT + receptacle | charge orb, packet out | 780,480 |
| 08 | `model-infrastructure` | 2 racks + processing chamber | LED banks, 2 fans, heat | 828,372 |
| 09 | `experiment-bench` | wooden alchemist bench | full-object sheet | 480,372 |

Every anchor sits **south** of its machine, so one `operate` animation serves every working
station - there is no per-station interaction art. Zone 09 was the Power Core, an ambient-only
recessed well; the Power Core was retired and the Experiment Bench took that pocket, so zone
09 is a working station like the rest.

Workflow-to-zone mappings:

- `ai-news`, `creator-content`, `monetization` -> `intelligence-research`
- `new-tools`, `agents` -> `scanner-bench`
- `playbooks` -> `experiment-bench`
- `github` -> `github-code`
- `models-infra` -> `model-infrastructure`
- `newsletter` -> `newsletter`
- `social-x` -> `x-communications`
- `terminal-publisher` -> `terminal-transmitter`

Unknown workflow IDs fall back to `central-operations`. A valid `context.station` overrides
the mapping through aliases such as `scanner`, `intel`, `creator`, `models`, `furnace`,
`social-x`, `terminal-publisher`, and `experiment`.

## Conduit Map (section 05)

One 8x8 packet sprite, five tints, at most 6 on screen. Beyond that they queue - never one
spawn per event.

| id | route | geometry | tint | trigger |
| --- | --- | --- | --- | --- |
| SP | spine (all zones) | H 132,246 -> 900,246 | cyan | any active workflow |
| D1 | intel bench -> spine | V 129,252 h60 up | cyan | researching / browsing / scanning |
| D2 | spine -> newsletter still | V 297,252 h60 down | purple | newsletter compiling |
| D3 | ops console -> experiment bench | V 477,216 h48 down | gold | evaluating / thinking |
| D4 | spine -> X console | V 525,252 h132 down | magenta | writing -> posting_to_x |
| D5 | X mast -> outside | V 596,0 h276 up, beam | magenta | posting_to_x |
| D6 | spine -> terminal transmitter | V 777,252 h108 down | gold | terminal_publish |
| D7 | furnace -> spine | V 825,252 h36 up | gold | processing / executing |
| D8 | transmitter -> wall port | H 864,390 w72 right | gold | terminal_publish |
| D9 | spine -> code station | V 153,252 h132 down | phosphor | coding |

Idle traffic is one slow cyan packet on SP every ~9s - it reads as "powered", not "busy".
On the research->newsletter and research->terminal handoffs the packet scales 8->12px for
400ms at the junction; that is the only time flow is loud.

## State Animation Language (section 04)

Every telemetry state maps to a local event on one machine. The room never changes globally
- that is what keeps concurrent workflows legible and one error pleasant to watch.

- **idle** - ambient only. Nothing telemetry-driven.
- **researching / browsing** - radar sweep starts, feed bank cycles, inbound packets on the spine.
- **scanning** - bench sweep bar traverses, ready lamp goes solid.
- **evaluating / thinking** - core breathes faster, packets loop the chamber.
- **writing / coding** - caret and progress glyphs only. **Never real draft text.**
- **processing / newsletter** - chamber fills, coil rotates, tray ejects a sheet.
- **posting_to_x** - console CRT, then lamps, then the mast dish charges and a magenta beam exits the top edge.
- **terminal_publish** - packet down the spine, receptacle charges gold, fires out the right wall port.
- **complete** - 2-frame phosphor flash, 600ms, then ease back to ambient over 1.2s.
- **warning / stale** - amber lamp on that machine, its loop slows to 60%. Room untouched.
- **error** - local malfunction only: static band, 3px jitter, one spark, red pilot; camper plays `react` once. **No full-screen overlay.**

Only three screens carry text, and only real strings: the ops CRT (`ACTIVE`/`STALE` counts
and uplink health), the code CRT (workflow token and state), and the X and transmitter CRTs
(transport state glyphs). No screen ever shows a draft or an unpublished post.

## Responsive (section 10)

Desktop shows the full 40x22 room. On phone portrait the scene reframes to a 384x336 world
window (16x14 tiles) - the same world, closer camera, never a shrunken room and never a
dashboard. The camera centres the zone that changed most recently, 600ms ease-out, then
holds at least 8s; idle focus frames zones 01 and 09 together. It never snap-cuts and never
follows the camper while he is only drifting between anchors. Landscape is treated as a small
desktop. Below the world sits one in-world strip - not cards: the focused workflow, its state
and concurrent count, a progress hairline in that zone's colour, and up to two unattended
workflows, dimmed.

## Replay Simulation

Fixture: `fixtures/command-center/replay.json`.

Run against local Vercel/Vite dev with:

```bash
COMMAND_CENTER_INGEST_SECRET=... npm run command-center:replay
```

Optional flags:

```bash
npm run command-center:replay -- --endpoint=http://127.0.0.1:3000/api/command-center/telemetry --delay-ms=1000 --run-id=demo
```

The replay posts only through authenticated ingest. No simulation controls ship in the public page.

## Asset Production

The full file-by-file contract - names, sizes, frame counts, fps, and how the manifest swap
works - lives in `public/assets/command-center/README.md`. Nothing is shipped from Star
Office or LimeZu.

The character reference render is at
`assets/command-center/reference/spawncamper9000-character-reference.png`. It is **not** a
production asset and must never be loaded by the scene; it is the visual authority for
generating the sprite sheet.

### Palette block (paste into every generation prompt)

```
16-colour ramp. bg #0d0214 #160420 #1e0729 #240a31 #2b0d3c #3a1450
brand #ad19d1 #ff2e97 #fed66d #5cfbf7  phosphor #39ff88  warm #ff7a2f
ink #f8edff #b89aca  line #c78ef5  warn #ffd98a
```

### Constraint block (paste into every generation prompt)

```
24px tile grid, 3/4 top-down game view, hard pixel edges, no anti-aliasing,
no outline glow baked in, no cast light baked in, transparent background,
single object centred, bottom-centre origin, flat readable silhouette
```

### Sheet prompts

Generation order: **02 -> 07 -> 01 -> 03 -> 04 -> 06 -> 05**. Bodies first: they set the
palette and the rivet language everything else copies.

1. **Environment** - "Dark alchemical AI facility floor and back wall, 24px pixel tiles, riveted purple-black metal panels, faint gold floor stencils, recessed cable channels, overhead pipe run along the wall top, 3/4 top-down, no furniture, no machines, no characters, no glow. 960x528."
2. **Workstation bodies** - "Set of retro-alchemy laboratory machine bodies, unlit and powered down: wide operator console, ribbed radar drum, long scanner bench, code bench with disk tower, tall copper distillation column with input tubes, communications console with antenna mast, heavy transmitter cabinet, two compute racks, industrial processing chamber. Purple-black metal, gold trim, dark screen holes left EMPTY. [CONSTRAINT BLOCK]"
3. **Screen content** (one row per machine) - "Pixel CRT screen contents only, no bezel, no shell: green phosphor terminal readout, cyan radar grid, cyan scanning bar, ASCII box-drawing status frame, magenta transmission meter, gold charge gauge. Flat, 6px pixel font, no curvature, transparent outside the screen rectangle. [CONSTRAINT BLOCK]"
4. **Small animated components** - "Sprite sheet of tiny industrial animated parts on transparent background: 4-frame fan blade rotation, 6-frame LED bank blink, 8-frame radar sweep wedge, 10-frame liquid-light chamber fill purple to magenta, 6-frame rotating coil, 8-frame gold charge orb. Uniform 24px-scale chunk. [CONSTRAINT BLOCK]"
5. **SpawnCamper9000** - "Pixel art robot mascot, 48x64 frames, 6-row sprite sheet: hovering gold ovoid torso with purple riveted collar, glass dome head containing a magenta brain, two dark segmented tentacle arms trailing, small hot orange chest core. Rows: idle 6f, hover travel front 8f, hover travel back 8f, operating console 6f, leaning to inspect 4f, glitch recoil 5f. Never walking, never legs. Baked soft ellipse shadow. [CONSTRAINT BLOCK]"
6. **Effects** - "Transparent pixel FX sheet: 8x8 glowing data packet 4f, 32x32 soft pulse 6f, 64x16 scan sweep 8f, 8x64 vertical transmission beam 6f, 48x32 success flash 3f, 128x40 CRT static glitch band 4f, 16x16 spark 5f. Single hue each, white core, additive-friendly. [CONSTRAINT BLOCK]"
7. **Foreground pieces** - "Front faces and lips of the same machines, 14px tall strips plus two 24x408 wall pilasters and a wall cable port. Slightly darker than the bodies, hard top edge highlight, transparent elsewhere. [CONSTRAINT BLOCK]"

### Atlases and budget

Three atlases at most - env (L1+L2), anim (L3+L5), char (L4) - each at or under 2048 square.
Every file is transparent except `env_floor_wall.png`. No semi-transparent anti-aliasing on
L2 edges or the 3/4 overlap seams show. Runtime budget: at most 22 ambient plus 8 operational
animations at once, one pooled emitter capped at 6 packets, at most 4 additive blends on
screen, and no full-screen effects ever - the vignette and scanline are baked into L1 and L6.

## Integration Example

SpawnCamper9000 or Hermes DGX can send heartbeats:

```bash
curl -X POST "$BASE_URL/api/command-center/telemetry" \
  -H "Authorization: Bearer $COMMAND_CENTER_INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow": "new-tools",
    "workflowLabel": "New Tools",
    "state": "researching",
    "activity": "Scanning AI gaming tools",
    "ttlSeconds": 900,
    "context": {
      "station": "scanner",
      "target": "AI gaming tools",
      "count": 12
    }
  }'
```
