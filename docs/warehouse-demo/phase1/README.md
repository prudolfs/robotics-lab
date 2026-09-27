# Phase 1 review — app shell and deterministic world

Phase 1 now has a runnable [warehouse app](../../../apps/warehouse-demo/README.md). Its [overview screenshot](../../../apps/warehouse-demo/screenshots/phase1-overview.png) shows the randomized truck cargo, existing stock, compact rack, forklift and inspector. The [completed sample](../../../apps/warehouse-demo/screenshots/phase1-complete.png) shows one pallet placed in storage.

## What is implemented

- The app uses the pinned Three.js 0.185.1, React Three Fiber 10.0.0-alpha.5 and Drei 11.0.0-alpha.7 stack. Canvas initialization checks the **active** WebGPU backend. An unavailable or failed backend leaves Start disabled and explains the requirement.
- The seeded generator places 3–4 incoming pallets among four truck slots and 1–3 existing pallets among eight bays. It rejects invalid seeds, preserves enough capacity and leaves cargo accessible in a valid unload order.
- A framework-independent world updates at 60 fixed ticks per simulated second. It owns forklift pose, steering, speed, fork height, pallet location, bay occupancy, collision checks, run status and events. React and Three render its snapshots.
- A scripted, autonomous showcase selects one accessible pallet and one available bay, drives through pickup, carry and placement, then pauses with a sample-complete message. Start, pause, restart same seed, randomize and 1×/4× playback work. Overview and follow cameras are available.
- Pickup and placement enforce alignment, reach, fork height and occupancy. The forklift chassis and carried load cannot pass through the floor bounds, truck walls, rack back or other pallets. Rejected actions and contacts are counted in state.

## Verification

`pnpm -C apps/warehouse-demo lint`, `test`, `build`, `build:probe` and `test:e2e` pass. The simulation suite contains 13 standalone `test(...)` cases: 1,000 scenario seeds, fixed-step replay and reset, collision bounds, pickup/placement rules, the six reference seeds and the first 100 showcase seeds. Two Chrome browser tests verify controls, WebGPU backend detection, a completed sample transfer and the unavailable-WebGPU message. The browser captured the linked screenshots with no page errors.

## Current boundary

This phase demonstrates **one pallet transfer** with placeholder meshes. It does not claim to unload every pallet. Phase 2 adds the repeatable multi-pallet task and route controller; Phase 3 adds Blender assets; Phase 4 adds Full Laya control. The WebGPU alpha stack still produces large build chunks, so later phases should measure and reduce load cost. The Phase 0 GLB renderer probe remains isolated at `/probe.html`.

**Stop here for user review before Phase 2.**
