# SpawnCamper9000 Command Center

The public `/command-center` Vite page renders sanitized workflow telemetry in the existing Phaser facility. Live telemetry is available on production; local verification uses intercepted browser fixtures and disposable PostgreSQL. Test events must not be sent to the production ingest endpoint. This implementation does not deploy.

## Scene and movement

The shipped character walks using four directional sheets and works facing north with `operate_back`. The legacy telemetry mode names remain compatible. `locomotion.mjs` owns destination, route progress, visual pose, attendance, arrival count, and cancellation generation. The scene paints one coherent controller snapshot each frame. Travel is a constant 180 world pixels/second, with no per-leg easing or duration clamps. Duplicate destinations preserve progress and animation phase; state changes at the same station update the pose and attendance. Immediate restoration and reduced motion use the same arrival path.

`walkGraph.mjs` inserts the actual current foot position into its containing segment before shortest-path routing. It merges collinear legs and refuses disconnected/off-graph destinations. The home point remains **480,228**. The room is **960×528**. Rendered coordinates are rounded to world pixels, textures use nearest-neighbor sampling, and the canvas presentation preserves its aspect ratio.

## Geometry and depth

`sceneConfig.mjs` owns placements, zone identities, and corridor segments. `assetMeasurements.json` records visual and bottom-eight-row contact bounds for every frame of all shipped character and machine assets. Regenerate it with `npm run command-center:measure` after replacing artwork. The tests independently decode each PNG and compare every opaque pixel against the recorded frame bounds.

`stationGeometry.mjs` combines those measurements with placements into visual bounds, inspection rectangles, ground footprints, depth baselines, north-facing working positions, interaction points, and authored screen/effect surfaces. Floor-machine footprints occupy their lower 24 world pixels; upper artwork can occlude the character without becoming a floor obstacle. All-direction foot clearance uses the measured union **[-41,+41] horizontally and [-8,0] vertically**. Individual directional envelopes are asymmetric.

The shipped environment has back-wall bases reaching approximately Y=166, side architecture ending around X=58 and X=902, and a front curb beginning at Y=504. Navigation uses the conservative floor rectangle X=60…900, Y=170…502. Zone 2 stands at **164,180**, below the wall base. Corridors avoid the narrow side-wall passages. The Creator Console, Tool Scanner and Opportunity Radar replacements are native 1600×200 sheets with 200×200 Phaser frames; the scanner has 20px bottom slack and a 104px measured opaque width, rendering approximately x264-368, y102-264 while preserving its floor contact at (316,264) and destination (316,276). The Radar has 32px bottom slack and an 88px measured opaque width, rendering x616-704, y128-264 while preserving its station and destination (660,276). The relocated X Uplink renders x406-554, y365-494 from its 148px-wide sheet and uses (480,502) as its lowest clear front position. The west corridor remains at X=241; measured Radar and X footprints are routed with explicit clearance detours.

Floor objects sort by ground-contact baseline, with character depth updated during travel. Finished artwork and fallback bodies/components use the same baseline rule. Wall fixtures and floor shadows remain behind floor objects; effects, foreground decoration and interface elements have explicit layers. Machine inspection bounds come from rendered art, with fallback geometry when textures fail.

## Attendance and effects

Only arrival for active hands-on work grants a machine its normal animation loop. Departure releases it immediately. Waiting, completion, warnings and errors do not run the working loop. Real unattended activity can retain restrained status lighting and data-flow indicators.

Effects change only when their resolved mode changes. Heartbeats preserve pulse phase. Glow scaling is relative to the intended size and resets when cancelled. Warning, glitch and completion effects use finished-machine geometry; screen glitches are masked to authored surfaces. Superseded completion flashes are cancelled. Transients are capped at 12, packet sprites at 6, and completion acknowledgements at 128.

## Polling and recovery

Each request has its own AbortController, 10-second timeout and generation. Superseded requests cannot publish, change backoff or schedule more polling. Malformed successful envelopes and older snapshots are rejected. Invalid workflow entries are ignored rather than turned into warning activity. The last valid state survives connection failures until its TTL or completion deadline expires.

A separate 250ms clock recalculates TTL and the 30-second completion acknowledgement using server-aligned time. Cached responses never rewind this clock. Visibility restoration recalculates immediately and refreshes telemetry. Stop/destroy remove timers and visibility listeners. Connection health is separate from workflow activity and is shown in the facility bar, the summary facts and accessible content.

Focus is stable through heartbeat-only changes. Higher-priority activity preempts immediately; meaningful equal-priority activity changes can change focus. Ties are deterministic. Station resolution is a valid explicit `context.station`, then the canonical workflow's owning station, then Central Operations. Lifecycle states control truthful status and animation but never redirect canonical workflow ownership.

## Live presentation

The summary above the room is the factual live feed. It selects the foreground run by stable `runId`, or exact workflow and `startedAt` for compatible older events, then merges the polled 30-event public history window with the already-loaded Recent Work details. Consecutive identical state/activity heartbeats collapse, only the newest six facts render, and a run without stable identity falls back to its current snapshot rather than borrowing events from another run. Completion and failure retain their final facts during the existing acknowledgement window before returning to the truthful between-tasks state.

The Central Operations wall CRT is a separate Phaser-native commentary surface. It uses deterministic allowlisted phrases selected from sanitized workflow state and activity categories; it does not display raw reasoning, invent findings, or call a generative model. Meaningful changes type onto the clipped screen, heartbeat-equivalent text keeps its animation phase, and reduced motion renders immediately with a static cursor. The external summary and polite live region remain the accessible source of the factual status.

## Persistence

Event persistence and public latest-state advancement are one PostgreSQL statement. Event-ID conflicts return the original stored event and attempt latest-state repair, so retries can recover rows left partially persisted by older versions. Concurrent duplicates serialize on the unique event index. Diagnostic events persist but never advance public latest state. Latest state compares `(event_timestamp, event_id-or-UUID)` with C collation, yielding deterministic equal-timestamp ordering.

## Viewport and lifecycle

One host-size calculation sets canvas dimensions and centered letterboxing in ordinary, portrait and fullscreen modes. The camera always shows the full logical 960×528 facility at zoom 1; mobile does not crop or automatically follow the operator. Phaser pointer bounds refresh after the canvas layout settles. Resize/fullscreen does not replace movement state.

Machine clicks and the semantic machine directory open a persistent inspector beside the scene on desktop and beneath it on narrow screens. Close, Escape, or another selection dismisses/replaces it; empty-floor and outside clicks do not. Focus moves to Close and returns to the originating machine button. The character and Central Operations remain inspectable. Physical station names remain fixed when another workflow uses them. The activity strip is an activity indicator, not a progress estimate.

The mobile presentation applies at ≤760px and to touch-only landscape viewports ≤1000px wide and ≤500px tall. It moves existing nodes into reading order: compact header/state, full room, 112px telemetry HUD and verbose disclosure, two-column machine directory with an inline inspector, compact expandable run history, newsletter, and About. `mobilePresentation.mjs` owns these reversible placements; telemetry and history remain shared. Focus in Room highlights without zooming, and Full Facility clears inspection. The expand control uses native fullscreen where available and otherwise expands the same room into the viewport with focus containment and scroll restoration. Browser chrome remains outside the fallback view.

`npm run command-center:verify:mobile` runs local-only fixtures across phone, landscape, breakpoint, and tablet/desktop sizes; checks the fold, full camera bounds, pointer-safe contain dimensions, disclosures, filters/pagination, truthful state changes, and native/unsupported/rejected fullscreen. Screenshots and measurements are written to `/tmp/cc-mobile-evidence` by default. Use `CC_CHROMIUM_PATH` when an explicit installed browser path is needed.

Manifest requests time out after five seconds; individual assets have bounded loading and loaded-texture/procedural fallbacks. Page exit removes polling, resize/fullscreen/visibility handlers, observers, animation frames, tweens and timers. Persisted pagehide suspends the existing game; pageshow wakes it and refreshes without destroying or duplicating the canvas.

## Data Model

Migrations: `migrations/20260820000000_create_command_center.sql`, additive `migrations/20260906000000_command_center_public_runs.sql`, and corrective `migrations/20260907000000_command_center_diagnostic_cleanup.sql`.

Tables:

- `command_center_events`: immutable public-safe event log.
- `command_center_workflow_state`: latest state per `agent + workflow`.

The storage layer uses `DATABASE_URL` with the existing Neon serverless pattern. `/api/terminal/signals` is unchanged and independent.

### Migration-first deployment

Command Center schema changes must be applied to the target database before deploying code that consumes them. Pull the intended Vercel environment into a temporary file so local overrides in `.env.local` are not replaced, inspect the target, then apply explicitly:

```bash
production_env=$(mktemp)
./node_modules/.bin/vc env pull "$production_env" --environment=production --yes
node --env-file="$production_env" scripts/command-center-schema.mjs migrate
node --env-file="$production_env" scripts/command-center-schema.mjs migrate --apply
node --env-file="$production_env" scripts/command-center-schema.mjs check
rm -f "$production_env"
```

The migration command requires `--apply`, runs in one transaction under an advisory lock, and refuses to commit if event rows are lost or latest public state is inconsistent. Vercel runs the read-only schema check before every deployment build and fails with the required migration path when its target database is incompatible. It never applies migrations during a build. Plain `npm run build` remains database-independent for local asset work.

`src/command-center/workflowCatalog.json` is the shared server/browser source of truth:

| workflow | canonical label | machine | station |
| --- | --- | --- | --- |
| `ai-news` | AI News | News Array | `intelligence-research` |
| `github` | GitHub | Repo Forge | `github-code` |
| `new-tools` | New Tools | Tool Scanner | `scanner-bench` |
| `agents` | Agents | Agent Lab | `agent-lab` |
| `models-infra` | Models Infra | Model Furnace | `model-infrastructure` |
| `creator-content` | Creator Content | Creator Console | `creator-console` |
| `monetization` | Monetization | Profit Analyzer | `profit-analyzer` |
| `playbooks` | Playbooks | Experiment Bench | `experiment-bench` |
| `newsletter` | Newsletter | Newsletter Still | `newsletter` |
| `social-x` | X / Social | X Uplink | `x-communications` |
| `terminal-publisher` | Terminal Publisher | Publish Transmitter | `terminal-transmitter` |
| `opportunity-scout` | Opportunity Scout | Opportunity Radar | `opportunity-radar` |

Known workflows always use the catalog label in storage projections and the UI, even if a producer supplies a different label. Unknown sanitized workflow slugs remain accepted: they use a sanitized supplied label or a title-cased slug and appear at Central Operations unless a valid explicit station is supplied.

## Private Ingest API

Required environment variable:

```bash
COMMAND_CENTER_INGEST_SECRET=...
```

Accepted payload:

```json
{
  "eventId": "optional-stable-id-for-retries",
  "runId": "optional-stable-run-id",
  "agent": "spawncamper9000",
  "workflow": "new-tools",
  "workflowLabel": "New Tools",
  "state": "researching",
  "activity": "Scanning AI gaming tools",
  "taskTitle": "Review new AI gaming tools",
  "outcome": "Three tools qualified for follow-up",
  "visibility": "public",
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

Required fields are `workflow`, `state`, and `activity`. `runId`, `taskTitle`, `outcome`, and `visibility` are optional; omitted visibility defaults to `public`. Visibility is `public` or `diagnostic`. The default agent is `spawncamper9000`. Unknown workflow slugs are allowed, while unknown top-level fields and unknown `context` fields are rejected. Public text is control-character sanitized and length-limited. `publicUrl` must be `http` or `https` and cannot include credentials.

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

`GET /api/command-center/state?historyLimit=30&agent=spawncamper9000`

The optional `agent` filter applies to both workflows and history. The Command Center always requests `spawncamper9000`.

Returns:

- `workflows`: latest public-safe state per workflow.
- `recentHistory`: latest public-safe events.
- `fetchedAt`: server timestamp.
- Workflow `id`, `eventId`, `eventOrder`: public event identity and deterministic ordering.
- Workflow `lastActivity`: sanitized workflow/state/timestamp/station reference from indexed history, even when `historyLimit=0`; retained for response compatibility, not station ownership.

The endpoint filters diagnostic rows. `isStale` means an expired heartbeat only for nonterminal activity, and `freshness` is `fresh`, `expired`, or `not_applicable`. The presentation layer reports expired running/waiting/warning activity as unknown while preserving its last-known state and timestamp. `complete`, `error`, and `idle` stay terminal regardless of age.

Fresh completion and failure states may animate as a brief acknowledgement, then the room returns to Between tasks. Their durable task/history status never changes.

## Public History API

`GET /api/command-center/history?agent=spawncamper9000&limit=8&cursor=…`

History groups events only by `(agent, runId)` or, for compatibility, exact `(agent, workflow, startedAt)`. It never groups by temporal proximity. Legacy events without either stable identity appear only as standalone `complete` or `error` tasks. Consecutive identical transitions are collapsed for display with occurrence counts while raw rows remain stored. Responses contain a deterministic opaque cursor, total event counts, capped event details, and an omitted-event count when applicable.

SpawnCamper9000 focuses on one workflow using this deterministic priority:

1. `error` or `warning`.
2. Transmission/publishing state: `terminal_publish`, `posting_to_x`, `newsletter`, or `publishing`.
3. Other active state.
4. Fresh `complete` acknowledgement.
5. Central Operations idle/home.


## Verification

```bash
npm test
npm run build
npm run command-center:measure
npm run command-center:schema:check

# Start the local Vite page in another terminal.
npm run dev
# Install the test browser once if needed: npx playwright install chromium
npm run command-center:verify:browser

# Disposable local PostgreSQL only. Never use production credentials here.
CC_TEST_DATABASE_URL=postgresql://postgres:LOCAL_TEST_PASSWORD@127.0.0.1:55432/postgres npm run command-center:verify:db
```

The browser runner intercepts local state requests and instruments the served module only in its isolated browser context. It never calls ingest. `CC_CHROMIUM_PATH` can select an existing Chromium installation, `CC_TEST_ORIGIN` selects a local server, and `CC_EVIDENCE_DIR` selects screenshot/results output (default `/tmp/cc-hardening-evidence`). The database runner creates and removes a unique test schema and rejects non-local database hosts.

Regression coverage includes request races, stop/start, malformed responses, timeout/outage expiry, visibility restoration, stable focus, canonical ownership, movement interruption, every ordered station pair and sampled intermediate route positions. PostgreSQL checks cover concurrent retries, equal-timestamp ordering, atomic rollback, repair, agent isolation and job boundaries. Browser checks inspect actual rendered animations, attendance, positions, hit targets, pulse phase, resize/fullscreen and bounded transition counts. The repository has no lint or type-check script; changed JavaScript is checked with `node --check`.

See `command-center-readiness.md` for the executed checks, evidence and remaining verification limits.
