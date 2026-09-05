# Command Center readiness — 2026-09-05

Implementation is complete and locally verified. Deployment and validation of production's live telemetry connection are outside this delivery. The existing Phaser scene, zone identities and artwork are preserved. A Creator Console PNG replaced in the workspace during implementation was retained and its new 200×200 frame geometry was integrated.

## Findings and changes

| Severity | Systemic cause | Shipped correction |
| --- | --- | --- |
| Critical | Requests shared mutable cancellation state; expiry depended on successful polling; event and latest-state writes were separate. | Per-request generation/controller/timeout, independent server-aligned expiry, malformed/older snapshot rejection, and atomic PostgreSQL event/latest-state persistence with retry repair. |
| Significant | Movement, animation and attendance had separate owners; routing treated feet as a point; floor and depth rules described placeholders. | One clock-driven locomotion controller at 180px/s, coherent arrival/attendance, retargeting from actual feet, measured ground geometry and baseline depth sorting. Every station is connected; invalid routes fail closed. |
| Significant | Focus followed timestamps; stationless statuses fell back to workflow ownership; fullscreen CSS could stretch the canvas. | Stable heartbeat focus, indexed last-activity restoration across reload/job boundaries, agent filtering, and one aspect-preserving canvas sizing path with settled pointer bounds. |
| Polish | Inspection/effects used old boxes, heartbeats restarted pulses, and connection text stayed misleading. | Rendered-art inspection bounds, outside/floor/Escape dismissal, live character inspection, surface-masked effects, bounded transients, physical station labels, and visible/accessibility connection updates. |
| Recovery | Asset/lifecycle ownership was incomplete. | Bounded manifest/texture loading, valid loaded/procedural fallbacks, cleanup of observers/listeners/timers/tweens/animation frames, and page-cache suspension/restoration. |

## Architecture improvements

- `locomotion.mjs` owns route progress, destination, pose, attendance and cancellation. Phaser renders that snapshot; movement no longer depends on tween completion chains.
- `stationGeometry.mjs` separates placements, measured visual bounds, ground footprints, foot destinations, screen surfaces and inspection geometry. `assetMeasurements.json` records every shipped frame, verified by independent PNG decoding.
- The polling client owns transport health and a separate expiry clock. The state model resolves stable focus and station retention without confusing workflow ownership with physical machinery.
- One SQL statement owns ingest atomicity and deterministic ordering. Existing tables/indexes are reused; no migration is needed.

## Verification evidence

- **163 tests passed**, including actual polling-client promise/time races, timeout, stop/start, malformed snapshots, outage expiry, visibility restoration, station retention and movement interruptions.
- **169 ordered station pairs** match an independent unit-grid shortest-path oracle. Additional intermediate-route samples are connected; every corridor pixel clears the measured foot envelope and authored ground footprints.
- Every opaque pixel in every shipped animation frame agrees with the recorded measurements. The new Creator Console sheet is 1600×200 with eight 200×200 frames, 136px visual width and 32px bottom slack. The Tool Scanner replacement is 1600×200 with eight 200×200 frames, 104px visual width and 20px bottom slack; its ground contact and destination are unchanged, and the X=241 west-lane route detours around its lower footprint through the X=409 clearance spur.
- **9 disposable PostgreSQL checks passed:** concurrent duplicate ingest, deterministic equal-timestamp ordering, older-event rejection, partial-state repair, missing-reference repair, rollback after injected failure, agent isolation, reload restoration with history disabled, and completed-job boundaries.
- Chromium browser coverage checks **rendered Phaser animations**, attendance, positions, inspection targets, phase-preserving effects, connection health, individual texture failures and reduced motion.
- A supplemental Chromium check confirms the portrait camera hold, cancellation of obsolete pans on desktop resize, and visible offline reporting while unexpired work remains active.
- Viewports: **1280×720, 1440×900, 1920×1080, 3440×1440, 850×900 and 390×844**. Aspect ratio passes in ordinary and native fullscreen layouts, including fullscreen during movement. 125% CSS zoom also passes.
- **600 accelerated transitions:** scene objects **136 → 136**, tweens **8 → 8**, timers **2 → 2**, resize listeners **4 → 4**; acknowledgement history remains below its 128-entry cap.
- Persisted pagehide/pageshow retains one game, and native back navigation restores one functioning canvas. No browser page errors or unsupported-renderer warnings were observed.
- `npm test`, `npm run build`, changed-JavaScript `node --check`, and `git diff --check` pass. There is **no lint or type-check script** in the repository.

Browser screenshots and structured results are generated under `/tmp/cc-hardening-evidence`: `station-*.png`, `approach-*.png`, `viewport-*.png`, `fullscreen.png`, `route-clearance.png`, `offline-retains-work.png`, and `results.json`. Station screenshots were visually reviewed for ground placement and occlusion. Reproduce them with `npm run command-center:verify:browser`; database checks use `npm run command-center:verify:db` with a disposable local `CC_TEST_DATABASE_URL`. Both runners reject non-local verification targets; browser fixtures never call ingest.

## Remaining risks and limits

- Production's actual live telemetry connection has not been exercised by these local fixtures. A production smoke check is still needed when deployment is authorized.
- Browser verification used Linux Chromium. Native browser-menu zoom, Safari/Firefox behavior and physical mobile-device interaction remain unverified; CSS zoom is a layout check, not a substitute for native browser zoom coverage.
- Back navigation and the persisted lifecycle were tested; actual browser-cache eligibility depends on browser policy and the hosting environment. The soak is accelerated, not a multi-day memory profile.
- The replacement Creator Console partially occludes the operator at the News Array, consistent with ground-baseline layering. Screenshots record this; its position and ground contact were preserved.
- Navigation uses authored 2D ground footprints and measured foot envelopes. The west corridor has little spare horizontal clearance; future asset/frame changes must rerun measurement and clearance tests. Screen masks are authored surfaces and also require review after artwork replacement.
- The build retains the existing large Phaser chunk warning (approximately 1.38MB minified). This work did not change frameworks or split Phaser itself.
