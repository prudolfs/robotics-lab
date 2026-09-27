# Phase 3 review — Blender assets and browser visuals

The warehouse now uses an authored Blender kit with the SLAM demo's teal/slate equipment, concrete, warm wood, amber details and cutaway presentation. The trailer roof and near side are open so incoming cargo remains visible. The eight storage bays have individual signs and floor markings; the rack uses open rails so stored loads can be seen from the overview.

Browser captures: [overview](overview.png), [truck pickup](dock-pickup.png), [moving follow](follow.png), [rack placement](rack-placement.png), and [completed shipment](complete.png).

## Source and runtime assets

The editable [warehouse.blend](../../../assets/warehouse-demo/warehouse.blend), shared [manifest](../../../assets/warehouse-demo/manifest.json), and [authoring workflow](../../../assets/warehouse-demo/README.md) are retained. The repeatable Python builder ran through the user's Blender MCP server on port 9876 and in an isolated background Blender process. The source file also reopened successfully in Blender 5.1.2 with its warehouse scene and pivots intact.

The source is an isolated Blender scene library, so it contains no unrelated user scene. GLB exports likewise contain only the active warehouse scene. Four GLBs use embedded textures, standard PBR materials and meshes batched by material and pivot. The complete set is about **2.03 MB uncompressed**; no network font or decoder is required to load these models. The floor texture is reused from the SLAM kit and embedded in the export. See the exact byte and triangle counts in [asset-export.json](asset-export.json).

| Bundle | Meshes | Triangles |
| --- | ---: | ---: |
| Environment, truck and rack | 12 | 17,912 |
| Forklift | 23 | 5,888 |
| Pallet A | 8 | 4,028 |
| Pallet B | 7 | 3,704 |

The manifest is consumed by the simulator and exporter. It records cargo slots, bay positions, floor and rack collision envelopes, forklift dimensions and named articulation nodes. GLB checks enforce pallet bounds, vehicle width and origin, and the presence of all wheel, steering, mast and fork pivots. A width check caught protruding wheel bolts; the final model fits the checked envelope.

## Motion and review

Four wheel nodes roll with travel distance, the rear wheels steer, and named mast/fork pivots follow fork height. The controller now stops to lift an attached pallet to 0.30 m before travel and lowers to approximately 0.10 m before release. Pallets follow the same carried state and fork height used by the simulator. A short visual settling transition smooths the small alignment tolerance at attachment and release; it does not move the vehicle or bypass collision checks.

Overview and follow views are joined by Dock and Rack detail cameras. The review captures show actual pickup, loaded travel and lowering during a seed-42 run, which completed in **272.2 simulated seconds**. The inspector distinguishes cargo still in the truck from cargo on the forks. Start waits for the models to load, and asset failures have an explicit error state.

## Production measurement

Measured from the built app served locally, in **Chrome 153.0.8010.54 headless without a WebGPU override flag**, on an **Apple M3 Pro, 18 GB RAM, macOS/Darwin 25.5.0**. The viewport was 1440 × 1000; the scene canvas was 1122 × 840 at DPR 1. The renderer reported its actual WebGPU backend and the adapter reported Apple / Metal 3. Full details are in [browser-review.json](browser-review.json).

| Measurement | Overview | Moving follow |
| --- | ---: | ---: |
| Mean frame rate | 60.0 FPS | 60.0 FPS |
| Median frame interval | 16.7 ms | 16.7 ms |
| 95th percentile frame interval | 16.7 ms | 16.8 ms |
| Draw calls, including render passes | 170 | 127 |
| Rendered triangles, including passes | 94,145 | 74,859 |

The fresh browser page became interactive in **517 ms** on local preview. Each frame-rate sample spans eight seconds after warm-up. These measurements describe this device and local delivery; they are not public-network load estimates or GPU-only timings. The asset budget required no further reduction after mesh batching. The alpha renderer still produces large JavaScript chunks, as recorded in earlier phases.

## Checks and review gate

The production build and lint pass. Seventeen standalone simulation `test(...)` cases pass, including all six reference seeds, 100 varied layouts, and the lift/carry/lower placement sequence. Five standalone GLB tests pass. Browser regression checks cover a full randomized delivery, unavailable WebGPU and a failed asset download. The production capture completed with no page errors.

**Phase 3 stops here for user review. Phase 4 (Full Laya) has not started.**
