# Warehouse Demo

Phase 1 preview of the autonomous warehouse delivery. It renders with Three.js WebGPU through React Three Fiber v10 alpha and Drei v11 alpha. The current scripted showcase moves **one** accessible pallet from the truck to an empty rack bay; unloading the remaining cargo and the two controller modes are planned for later phases.

Run `pnpm -C apps/warehouse-demo dev` and open the local URL. A WebGPU-capable browser and device are required. The page confirms the active WebGPU backend and explains when it is unavailable.

Use **Start transfer** to watch the sample, **Pause** to stop it, **Restart** to replay the same seed, and **Randomize** to generate new cargo positions and existing stock. The speed selector offers 1× and 4× simulation playback. Overview and follow buttons change the camera; there are no manual driving controls. The inspector shows the selected cargo and bay, carried load, progress, contact/invalid counts, and recent events.

The fixed-step world and seeded generator live in `src/sim`; the scene reads world snapshots. Run `pnpm -C apps/warehouse-demo test` for simulation checks, `pnpm -C apps/warehouse-demo test:e2e` for browser checks, and `pnpm -C apps/warehouse-demo build` for the production bundle. All new tests use standalone `test(...)` functions.

The separate Phase 0 renderer probe remains available through `pnpm -C apps/warehouse-demo dev:probe` at `/probe.html`.
