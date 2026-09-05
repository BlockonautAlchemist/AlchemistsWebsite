# SpawnCamper9000 Command Center

The public `/command-center` Vite page renders sanitized workflow telemetry in the existing Phaser facility. Live telemetry is available on production; local verification uses intercepted browser fixtures and disposable PostgreSQL. Test events must not be sent to the production ingest endpoint. This implementation does not deploy.

## Scene and movement

The shipped character walks using four directional sheets and works facing north with `operate_back`. The legacy telemetry mode names remain compatible. `locomotion.mjs` owns destination, route progress, visual pose, attendance, arrival count, and cancellation generation. The scene paints one coherent controller snapshot each frame. Travel is a constant 180 world pixels/second, with no per-leg easing or duration clamps. Duplicate destinations preserve progress and animation phase; state changes at the same station update the pose and attendance. Immediate restoration and reduced motion use the same arrival path.

`walkGraph.mjs` inserts the actual current foot position into its containing segment before shortest-path routing. It merges collinear legs and refuses disconnected/off-graph destinations. The home point remains **480,228**. The room is **960×528**. Rendered coordinates are rounded to world pixels, textures use nearest-neighbor sampling, and the canvas presentation preserves its aspect ratio.

## Geometry and depth

`sceneConfig.mjs` owns placements, zone identities, and corridor segments. `assetMeasurements.json` records visual and bottom-eight-row contact bounds for every frame of all shipped character and machine assets. Regenerate it with `npm run command-center:measure` after replacing artwork. The tests independently decode each PNG and compare every opaque pixel against the recorded frame bounds.

`stationGeometry.mjs` combines those measurements with placements into visual bounds, inspection rectangles, ground footprints, depth baselines, north-facing working positions, interaction points, and authored screen/effect surfaces. Floor-machine footprints occupy their lower 24 world pixels; upper artwork can occlude the character without becoming a floor obstacle. All-direction foot clearance uses the measured union **[-41,+41] horizontally and [-8,0] vertically**. Individual directional envelopes are asymmetric.

The shipped environment has back-wall bases reaching approximately Y=166, side architecture ending around X=58 and X=902, and a front curb beginning at Y=504. Navigation uses the conservative floor rectangle X=60…900, Y=170…502. Zone 2 stands at **164,180**, below the wall base. Corridors avoid the narrow side-wall passages. The Creator Console PNG supplied during implementation is 1600×200; its frame slicing and bottom slack were updated while preserving its ground contact. The west corridor moved to X=241 to clear its wider silhouette; no artwork placements changed.

Floor objects sort by ground-contact baseline, with character depth updated during travel. Finished artwork and fallback bodies/components use the same baseline rule. Wall fixtures and floor shadows remain behind floor objects; effects, foreground decoration and interface elements have explicit layers. Machine inspection bounds come from rendered art, with fallback geometry when textures fail.

## Attendance and effects

Only arrival for active hands-on work grants a machine its normal animation loop. Departure releases it immediately. Waiting, completion, warnings and errors do not run the working loop. Real unattended activity can retain restrained status lighting and data-flow indicators.

Effects change only when their resolved mode changes. Heartbeats preserve pulse phase. Glow scaling is relative to the intended size and resets when cancelled. Warning, glitch and completion effects use finished-machine geometry; screen glitches are masked to authored surfaces. Superseded completion flashes are cancelled. Transients are capped at 12, packet sprites at 6, and completion acknowledgements at 128.

## Polling and recovery

Each request has its own AbortController, 10-second timeout and generation. Superseded requests cannot publish, change backoff or schedule more polling. Malformed successful envelopes and older snapshots are rejected. Invalid workflow entries are ignored rather than turned into warning activity. The last valid state survives connection failures until its TTL or completion deadline expires.

A separate 250ms clock recalculates TTL and the 30-second completion acknowledgement using server-aligned time. Cached responses never rewind this clock. Visibility restoration recalculates immediately and refreshes telemetry. Stop/destroy remove timers and visibility listeners. Connection health is separate from workflow activity and is shown in the facility bar, the Ops readout and accessible content.

Focus is stable through heartbeat-only changes. Higher-priority activity preempts immediately; meaningful equal-priority activity changes can change focus. Ties are deterministic. Stationless waiting/completion/warning/error states retain the workflow's last activity station, with `startedAt` and completed-job boundaries preventing reuse across jobs. Workflow ownership stays separate from the physical station label. Workflow aliases and Hermes job identities use the canonical machine mapping.

## Persistence

Event persistence and latest-state advancement are one PostgreSQL statement. Event-ID conflicts return the original stored event and attempt latest-state repair, so retries can recover rows left partially persisted by older versions. Concurrent duplicates serialize on the unique event index. Latest state compares `(event_timestamp, event_id-or-UUID)` with C collation, yielding deterministic equal-timestamp ordering. Existing tables and indexes are reused; there is no schema migration.

## Viewport and lifecycle

One host-size calculation sets canvas dimensions and centered letterboxing in ordinary, portrait and fullscreen modes. Phaser pointer bounds refresh after the canvas layout settles. Resize/fullscreen does not replace movement state. Portrait camera focus passes through one hold policy and cancels obsolete pans when viewport mode changes.

Machine clicks open an inspector beside projected object bounds, with bounded scrolling when space is limited. Empty-floor clicks, outside clicks and Escape dismiss it. The character inspector updates while open. Physical station names remain fixed when another workflow uses them. The activity strip is an activity indicator, not a progress estimate.

Manifest requests time out after five seconds; individual assets have bounded loading and loaded-texture/procedural fallbacks. Page exit removes polling, resize/fullscreen/visibility handlers, observers, animation frames, tweens and timers. Persisted pagehide suspends the existing game; pageshow wakes it and refreshes without destroying or duplicating the canvas.

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

`GET /api/command-center/state?historyLimit=30&agent=spawncamper9000`

The optional `agent` filter applies to both workflows and history. The Command Center always requests `spawncamper9000`.

Returns:

- `workflows`: latest public-safe state per workflow.
- `recentHistory`: latest public-safe events.
- `fetchedAt`: server timestamp.
- Workflow `id`, `eventId`, `eventOrder`: public event identity and deterministic ordering.
- Workflow `lastActivity`: sanitized workflow/state/timestamp/station reference from indexed history, even when `historyLimit=0`.

The frontend applies TTL fallback. When `expiresAt` has passed, a workflow is marked stale and visually falls back to idle so active states do not stay active forever. Heartbeat updates should arrive before `ttlSeconds` expires.

`complete` is treated as a brief visual acknowledgement. Fresh complete states animate in the affected area for 30 seconds, then visually return to idle unless another visible workflow is active.

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

# Start the local Vite page in another terminal.
npm run dev
# Install the test browser once if needed: npx playwright install chromium
npm run command-center:verify:browser

# Disposable local PostgreSQL only. Never use production credentials here.
CC_TEST_DATABASE_URL=postgresql://postgres:LOCAL_TEST_PASSWORD@127.0.0.1:55432/postgres npm run command-center:verify:db
```

The browser runner intercepts local state requests and instruments the served module only in its isolated browser context. It never calls ingest. `CC_CHROMIUM_PATH` can select an existing Chromium installation, `CC_TEST_ORIGIN` selects a local server, and `CC_EVIDENCE_DIR` selects screenshot/results output (default `/tmp/cc-hardening-evidence`). The database runner creates and removes a unique test schema and rejects non-local database hosts.

Regression coverage includes request races, stop/start, malformed responses, timeout/outage expiry, visibility restoration, stable focus, station retention, movement interruption, every ordered station pair and sampled intermediate route positions. PostgreSQL checks cover concurrent retries, equal-timestamp ordering, atomic rollback, repair, agent isolation and job boundaries. Browser checks inspect actual rendered animations, attendance, positions, hit targets, pulse phase, resize/fullscreen and bounded transition counts. The repository has no lint or type-check script; changed JavaScript is checked with `node --check`.

See `command-center-readiness.md` for the executed checks, evidence and remaining verification limits.
