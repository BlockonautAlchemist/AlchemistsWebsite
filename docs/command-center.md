# SpawnCamper9000 Command Center

## Architecture

`/command-center` is a public read-only Vite page backed by two Vercel API endpoints:

- `POST /api/command-center/telemetry`: private authenticated ingest for SpawnCamper9000 and future agents.
- `GET /api/command-center/state`: sanitized public workflow state plus recent public history.

The frontend uses Phaser for a pixel command-center canvas. Star Office UI concepts adapted here are scene/state separation, a moving agent, station mapping, state-driven animation modes, speech bubbles, simultaneous workflow activity, packet effects, polling/backoff, stale TTL fallback, and responsive canvas framing. No Star Office UI artwork or third-party game art is included.

The implementation is deliberately config-driven:

- Visual layout and asset paths live in `src/command-center/sceneConfig.mjs`.
- State-to-visual behavior lives in `src/command-center/visualMappings.mjs`.
- Public payload normalization and stale handling live in `src/command-center/stateModel.mjs`.
- Polling/backoff/hidden-tab throttling lives in `src/command-center/telemetryClient.mjs`.
- Phaser rendering lives in `src/command-center/CommandCenterScene.mjs`.

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

## Workflow Mapping

Initial workflow-to-station mappings:

- `ai-news` -> `research`
- `new-tools` -> `scanner`
- `github` -> `github`
- `agents` -> `research`
- `models-infra` -> `models`
- `creator-content` -> `creator`
- `monetization` -> `monetization`
- `playbooks` -> `playbooks`
- `newsletter` -> `newsletter`
- `terminal-publisher` -> `terminal-publisher`
- `social-x` -> `social-x`

Unknown workflow IDs fall back to `uplink`. A valid `context.station` can override the mapping.

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

## Asset Replacement Spec

Current placeholders are original SVG assets served from `public/assets/command-center/placeholder/`. They are intentionally simple and replaceable.

Recommended production assets for the next design phase:

- World canvas: `1280x720`, pixel-art rendering enabled.
- Tile size: `32x32`.
- Environment background: single PNG/WebP `1280x720`; no transparency required.
- Optional tile layer: `32x32` tiles, orthographic/top-down or three-quarter pixel style.
- SpawnCamper sprite sheet: transparent PNG/WebP, frame size `96x96`, consistent origin near feet.
- SpawnCamper animations: `idle`, `walk_down`, `walk_up`, `walk_left`, `walk_right`, `typing`, `thinking`, `error`, `celebrate_small`.
- Minimum character frames: idle `4`, walk per direction `4-8`, typing `4-8`, thinking `4`, error `4`.
- Workstation/prop sheets: transparent PNG/WebP, default frame size `128x128`.
- Station animation names: `idle`, `active`, `warning`, `error`, `complete`.
- Data packet sprite: transparent PNG/WebP, `16x16` or `32x32`, optional `idle/flow` frames.
- Speech/status bubble: Phaser-rendered initially; future bitmap bubble skin optional.
- Phaser constraints: consistent frame dimensions per sheet, no mixed frame sizes inside one spritesheet, power-of-two not required, nearest-neighbor pixel rendering.

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
