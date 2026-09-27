# Warehouse Demo

Phase 3 of the autonomous warehouse delivery. It renders authored Blender assets with Three.js WebGPU through React Three Fiber v10 alpha and Drei v11 alpha. The **Predictable** controller unloads every incoming pallet into an empty bay, with visible pickup, lift, carry and lowering. Full Laya control follows in Phase 4.

Run `pnpm -C apps/warehouse-demo dev` and open the local URL. A WebGPU-capable browser and device are required. The page confirms the active WebGPU backend and explains when it is unavailable.

Use **Start delivery** to watch the full run, **Pause** to stop it, **Restart** to replay the same seed, and **Randomize** to generate new cargo positions and existing stock. The speed selector offers 1×, 4× and 8× simulation playback. Overview, follow, dock and rack buttons change the camera; Route toggles the current goal cue. There are no manual driving controls. The inspector shows the selected cargo and bay, current step and goal, carried load, progress, contact/invalid counts, and recent events.

The fixed-step world, seeded generator, route graph, task selector and motion controller live in `src/sim`; the scene reads world snapshots. Run `pnpm -C apps/warehouse-demo test` for simulation checks, `pnpm -C apps/warehouse-demo test:e2e` for browser checks, and `pnpm -C apps/warehouse-demo build` for the production bundle. All new tests use standalone `test(...)` functions.

The separate Phase 0 renderer probe remains available through `pnpm -C apps/warehouse-demo dev:probe` at `/probe.html`.

See [the asset workflow](../../assets/warehouse-demo/README.md) for the editable Blender source, repeatable MCP/background export, manifest and GLB checks. Browser captures and production performance measurements are in the [Phase 3 review](../../docs/warehouse-demo/phase3/README.md).
