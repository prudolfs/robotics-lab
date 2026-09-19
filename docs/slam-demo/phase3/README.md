# Phase 3 review — calibrated stereo acquisition

Phase 3 connects real 640×480 stereo pixels to an isolated preprocessing worker. Both eyes use the same exact simulation pose at 10 Hz. The preview shows the exact grayscale buffers returned by that worker, with synchronized frame ID, timestamp and calibrated center-row overlay. **Feature detection, visual odometry and SLAM are still not connected; those begin in Phase 4.**

Open [SLAM Studio](http://localhost:8082). Before starting, inspect Left image / Right image, then run and pause. In **Stereo acquisition**, select rendered pixels or explicitly labeled synthetic oracle observations, choose real-time or lockstep timing, and adjust noise/dropout. Settings restart an idle run and are locked after driving starts; Reset unlocks them.

## Review evidence

- [Ready, pair zero](ready.png), [capturing](capturing.png), [recorded replay](replay.png), [synthetic oracle](synthetic.png), [mobile](mobile.png).
- [Browser and GPU checks](browser-review.json): measured raster positions for an off-center principal point, positive stereo disparity, row alignment and render-target restoration.
- [Compressed six-pair pixel fixture](captured.slamframes.gz), [SHA-256 and expected per-pair checksums](fixture.json), [Node replay result](replay.json). These are actual browser pixels, not regenerated geometry.

**Save last 6 pairs** exports a small `.slamframes` fixture (fewer pairs are available just after reset). **Replay pixels** imports it, pauses the robot and processes one pair at a time without camera rendering. Reset during replay invalidates outstanding work and restarts that recording from its first pair; **Return to live sensor** starts a fresh live run. This is a bounded acquisition fixture, not the full session recording/seek system planned for Phase 8.

## Capture and ownership contract

The simulator emits every fixed 60 Hz step, independently of React publication. Capture runs at tick 0 and every sixth tick, so frame `n` has simulation timestamp `n / 10`. Both cameras render synchronously before the pose can advance. A slow render can slow wall time; it does not move one eye to a different simulation pose or substitute the current display pose for a missed sensor tick.

The [capture adapter](../../../apps/slam-demo/src/sensor/capture.ts) owns an isolated Three scene containing only clones of authored lab/walls/rover, fixed lighting and two calibrated poses. Full near walls are always present. Debug paths, odometry rings, display cameras, quality/shadow preferences, tone mapping and cinematic effects do not enter it. Geometry/material resources are shared safely; mesh transforms and render targets are independent. The adapter restores the previous renderer state in `finally` and flips bottom-up WebGL readback exactly once.

Calibration comes from the shared manifest: 640×480, fx/fy 480 px, cx/cy 320/240 px, 120 mm baseline, 450 mm mounting height, 50 mm–30 m clipping range. The sensor projection matrix uses all intrinsics directly; it is independent of the viewport's aspect ratio. Optical axes are right/down/forward; the scene conversion occurs only in the adapter. A GPU fixture additionally verifies non-centered intrinsics (cx 300, cy 210), ruling out an accidental FOV-only implementation.

The [pure sensor module](../../../packages/sensors/src/stereo.ts) contains projection/unprojection, planar rig transforms, segment–AABB visibility, seeded observation jitter/dropout, bounded uniform RGB noise, top-down row conversion and deterministic grayscale preprocessing. It has no Three, DOM or React dependency. Synthetic observations use a separate known point fixture and simplified occlusion boxes; their IDs are explicitly oracle correspondences. They are not claimed to reproduce every authored triangle or to be image-derived tracks.

The [worker](../../../apps/slam-demo/src/sensor/processing.worker.ts) receives only buffers, calibration, mode, generation and frame clock (plus known pixel observations in synthetic mode). It receives no truth pose, world coordinates, depth buffer, object identifier or odometry. Its current processing is grayscale conversion, a diagnostic FNV checksum and mean intensity—not a pose estimate. Pixel noise is applied to actual RGB samples before transfer, with independent per-eye seeds. Pair dropout is seeded by frame ID; synthetic mode additionally applies observation dropout and pixel-coordinate jitter.

[FramePipeline](../../../apps/slam-demo/src/sensor/pipeline.ts) allows one transferred active pair and one main-thread pending pair. In real time, newer arrivals replace the pending pair and increment backlog drops. In lockstep, simulation waits for the active result; elapsed wall time while waiting is discarded rather than accumulated for a catch-up burst. Recorded fixtures also run in lockstep. Results transfer ownership back to the main thread. The latest result is retained for the canvas, previous buffers enter a four-buffer reuse pool, and a six-pair ring holds independent recording copies. No detached input buffer is read by the producer.

Reset terminates the previous worker, clears pending work/history, increments the generation, and recreates a worker. Both generation and worker identity reject stale replies. Worker creation/runtime failures and graphics-context loss pause the run with retry guidance. Unmount disposes the private render target and terminates the worker without disposing shared GLTF resources. Recorded imports validate dimensions, frame clocks, ordering, byte counts and bounded file size, and whitelist the data forwarded to the worker.

## Measurements and limits

The final checks passed **81 unit tests and 8 browser tests**, plus app/sensor typechecks, lint, production build and exact Node replay.

The raw report names the local Chrome version. Reference hardware remains the Apple M3 Pro from Phase 0. GPU fixture centroids are compared with analytic predictions with a 0.6-pixel rasterization tolerance; both eyes' vertical positions agree within that tolerance. The current browser sample records delivered real-time and simulation-time rates, capture-plus-noise time, preprocessing time and queue/drop counters. The saved sample reports 10.0 pairs per simulation second, 9.3 pairs per wall second averaged from the initial ready frame (including setup/idle time), 4.4 ms capture-plus-noise and 1.1 ms worker preprocessing, with zero sensor/backlog drops. These are a short smoke measurement, not the full stereo + feature tracking + mapping benchmark reserved for later phases.

One 640×480 RGBA stereo pair is 2.344 MiB. Active+pending input is capped at 4.688 MiB; six retained fixture pairs use 14.063 MiB. Latest preview, reusable buffers and the transient producer add bounded storage; live pixel storage is roughly 28 MiB at its conservative peak, excluding browser/worker/driver overhead. Import is bounded to six pairs, dimensions at most 1024² and a 52 MiB file, so temporary replay storage can be larger. No unbounded worker queue or frame history is retained.

The sensor uses synchronous WebGL2 readback for atomic exposures; this is an explicit Phase 3 tradeoff. It currently avoids shadow and presentation postprocessing passes. Future stereo/vision performance work must preserve calibration and timestamp semantics. GPU-generated pixels may differ across devices; exact algorithm regression replays the committed bytes instead of rerendering them. FNV checksums diagnose frame differences; SHA-256 protects the committed fixture's byte identity.

## Validation and reproduction

Unit tests cover projection round trips, rotated stereo rigs, visibility/occlusion, noise/dropout determinism, row orientation, grayscale idempotence, synthetic lockstep fixtures, buffer ownership, queue replacement, ordering, worker errors, reset generations, fixed capture ticks, recording validation and reset during active replay. Browser tests exercise only public UI controls: presentation-independent pixels, actual noisy pixel changes, repeatable seeded reset, left/right views, download/import replay, rapid reset and visible oracle/dropout state. Existing driving, pause/reset, responsive layout and asset-failure checks remain included.

```sh
pnpm -C apps/slam-demo lint
pnpm -C apps/slam-demo typecheck
pnpm -C packages/sensors typecheck
node_modules/.bin/vitest run packages/sensors packages/robot packages/noise apps/slam-demo/src
pnpm test:e2e:slam

# With pnpm dev:slam running, refresh browser review and the captured fixture:
node scripts/slam-phase3/review.mjs

# Replay the committed pixels in Node with no browser, renderer or Blender:
node_modules/.bin/esbuild scripts/slam-phase3/replay.ts --bundle --platform=node \
  --format=esm --outfile=.temp/slam-phase3-replay.mjs
node .temp/slam-phase3-replay.mjs
```

The screenshot runner also saves the uncompressed importable fixture to `.temp/slam-phase3/captured.slamframes`. To inspect the committed gzip fixture in the UI without rerendering, decompress it to a `.slamframes` file and choose it under Replay pixels.

Phase 3 stops here for user review. Phase 4 tracking tasks remain unchecked.
