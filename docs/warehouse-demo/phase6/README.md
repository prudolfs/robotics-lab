# Phase 6 review — verification and release

Phase 6 is complete. The app is ready for user review.

## Run it

From the repository root, install dependencies with `pnpm install`, then run `pnpm -C apps/warehouse-demo dev` and open `http://127.0.0.1:8084`. Select **Predictable** and **Start delivery** for a complete autonomous shipment. A WebGPU-capable browser and device are required. For **Full Laya**, start the local decision server at `http://127.0.0.1:8000/v1/systemone`; the Vite proxy forwards `/api/laya/v1/systemone`. `LAYA_ORIGIN` changes the proxy destination, and `VITE_LAYA_ENDPOINT` changes the browser endpoint. A static deployment needs its own reachable decision endpoint or same-origin proxy.

With the dev server running, use another terminal for `pnpm -C apps/warehouse-demo test:e2e`. Run `pnpm -C apps/warehouse-demo test`, `pnpm -C apps/warehouse-demo build`, and `pnpm -C apps/warehouse-demo lint` for the other app checks. To repeat the production browser check, start `pnpm -C apps/warehouse-demo exec vite preview --host 127.0.0.1 --port 4184`, then run `node scripts/warehouse-phase6/verify-production.mjs` from the root.

The [app README](../../../apps/warehouse-demo/README.md) documents controls, replay and capture commands. The [asset guide](../../../assets/warehouse-demo/README.md) documents the editable `warehouse.blend`, manifest, Blender MCP/background export and GLB validation.

## Architecture

The seeded scenario, fixed-step warehouse, pallet preconditions, predictable controller and Laya adapter live in `apps/warehouse-demo/src/sim`, independent of React. The controller owns snapshots, bounded Laya requests, summaries and recorded frames. React observes those snapshots; React Three Fiber v10 alpha, Drei v11 alpha and Three.js WebGPU render the authored GLBs. The simulator enforces collisions and pickup/placement rules in both modes. Predictable selects tasks and steers by a route graph; Full Laya selects cargo, bay and discrete motor commands through the local service. Recorded Laya playback reads stored simulation frames and makes no service requests.

## Production browser result

The built app was served locally from Vite preview and checked in Chrome 153.0.8010.54 on Apple Metal 3, without a WebGPU override flag. The page reported **WEBGPU ACTIVE** and the renderer reported `webgpu`. Seed 42 completed **4/4 pallets in 4:32.2 simulated time**, with **zero contacts, invalid actions and pauses**. The missing-WebGPU check displayed **WebGPU is unavailable** and disabled Start. Median/p95 sampled frame intervals were **16.7/16.7 ms**; this is one reference setup, not a universal frame-rate guarantee. See [measurements](production-review.json) and [completed scene](production-complete.png).

Earlier Phase 4 [real-model measurements](../phase4/README.md) completed all six reference seeds in Full Laya, 20/20 transfers, with zero contacts or invalid actions. Phase 5 [recording checks](../phase5/README.md) verified exact stored-state playback and a simulated service disconnect. These remain bounded reference measurements, not a guarantee for every seed, wording or model version.

## Visual correction

The concrete finish and foundation originally shared a top surface at height zero, causing the dark rectangular flicker. The foundation now ends 5 cm below the walking surface, underneath the finish slab. The Blender source and exported GLBs were rebuilt, and the four screenshots, app GIF, X video and monorepo header were recaptured. Asset validation passed all five checks. Randomize also now rejects candidate seeds that reproduce either the previous cargo arrangement or the occupied bay set.

## Captures

The four current 1080×1080 views are [overview](../../../apps/warehouse-demo/screenshots/overview.png), [dock pickup](../../../apps/warehouse-demo/screenshots/dock-pickup.png), [follow forklift](../../../apps/warehouse-demo/screenshots/follow-forklift.png) and [rack placement](../../../apps/warehouse-demo/screenshots/rack-placement.png). The old Phase 1/2 screenshots were removed. The [app GIF](../../../apps/warehouse-demo/media/preview.gif) and [15.7-second square MP4 for X](../../../apps/warehouse-demo/media/x-preview.mp4) show a complete seed-42 Predictable run. Run `pnpm screenshots:warehouse` to recapture all of them, or `pnpm video:warehouse:x` for the MP4 and app GIF. Both commands use browser pixels and ffmpeg. The root [README header GIF](../../readme-header.gif) now includes the warehouse alongside the other three apps; `pnpm readme:gif` regenerates it.

## Verification

| Check | Result |
| --- | --- |
| Warehouse simulation/client suite | 36 tests passed |
| Warehouse public browser suite | 10 tests passed; start, same-seed restart, randomization, Predictable completion, mode switch, failed Laya, missing assets and missing WebGPU |
| Shared packages | 209 tests passed across 31 files (`pnpm exec vitest run packages`) |
| App typecheck, production build and Biome | Passed |
| Production preview | Complete seed-42 delivery and unsupported-WebGPU check passed |

The root `pnpm test` currently reports six unrelated simulator/drone suite import failures because their `@/` aliases are not configured in the root Vitest runner. Its other 47 files and 364 tests passed. The warehouse and shared-package checks above ran independently and passed. The production build still reports the existing large-chunk warning.

## Limits

The graphics use a compact single-level rack and a simplified forklift kinematic model. Full Laya requires a local service and runs at 1×; delayed, invalid or stalled decisions pause visibly. The saved recording is kept in the current tab only. The WebGPU renderer requires compatible hardware/browser support. React Three Fiber v10 and Drei v11 are pinned alpha releases.
