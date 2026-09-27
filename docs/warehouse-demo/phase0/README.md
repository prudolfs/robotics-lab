# Warehouse Demo — Phase 0 review

Phase 0 defines a compact scenario and probes the two riskiest dependencies: live Laya decisions and the prerelease WebGPU renderer stack. Review the [layout and style sheet](layout-and-style.svg) and [browser WebGPU screenshot](webgpu-probe.png) before Phase 1.

## Scene and coordinate contract

World units are meters and seconds. The warehouse floor is `x = -6..6`, `y = 0..12`; the truck bed is `x = -3.8..-0.1`, `y = -6.2..0`. `z` points up. Heading `0` points along `+x`, with positive angles turning toward `+y`. The truck bed and warehouse floor share one height to keep the first pickup route level. The default camera is a high three-quarter view from the open side, framing the truck mouth, forklift and all eight bays.

| Element | Phase 0 dimensions / rule |
| --- | --- |
| Truck | 3.7 m wide × 6.2 m bed, two straight access lanes. Four possible cargo slots centered at `x=-2.8/-1.0`, `y=-2.1/-4.1`. The near pallet in a lane blocks its rear pallet. |
| Warehouse | 12 × 12 m cutaway shell, clear dock apron and short cross aisle. Rack on the east side, front facing west. |
| Storage | One single-level rack with eight bays, centers `x=4.9`, `y=2.35+1.25i` for `i=0..7`. Existing stock fills one to three bays. Each bay holds one pallet. |
| Forklift | Planning footprint 1.0 × 1.8 m, 1.2 m wheelbase, rear steering, maximum speed 1.0 m/s forward and 0.6 m/s reverse, maximum steering angle ±0.55 rad. Width fits the 1.8 m truck lane pitch; turns happen outside the truck. |
| Mast and load | Fork height range 0.08–1.2 m, maximum vertical speed 0.35 m/s. Pallets are about 1.1 × 1.1 m; all first-release bays are at floor level. A carried pallet has one owner and moves with the fork transform. |

The fixed-step simulator proposed for Phase 1 uses `dt=1/60 s`. Forklift pose is `(x,y,heading)`, with signed speed, steering angle, fork height and optional carried pallet ID. Pallets are in exactly one of three states: truck slot, carried, or storage bay. A bay is empty or occupied by one pallet ID. Run status is `ready`, `running`, `paused`, `complete` or `failed`, with monotonic simulation time and a reset generation ID. Rendering reads state snapshots and does not own simulation state.

Pickup requires an accessible pallet, no current load, fork-pocket alignment within 0.12 m laterally and 10° in heading, fork height 0.08–0.16 m, and reach within 0.20 m. Placement requires an empty bay, matching alignment/height and a carried pallet. The simulator rejects commands that cross solid geometry, move a load through a rack/truck wall, attach an inaccessible pallet or release onto an occupied bay. Exact tolerances will be tuned against the authored meshes in Phase 1/3; the rules remain explicit.

## Seeded scenarios and controller comparison

The [scenario fixture](../../../scripts/warehouse-phase0/scenarios.mjs) uses a uint32 seed and a local Mulberry32 generator. It chooses three or four incoming cargo IDs, shuffles their assignment to the four truck slots, and fills one to three distinct bays with existing stock. It never generates more cargo than empty bays. It also checks the lane dependency so at least one cargo pallet is accessible until all are removed. The bay fronts share an unobstructed aisle; the truck lanes are straight and require no turn inside the trailer.

`node scripts/warehouse-phase0/scenarios.mjs 1000` checked seeds `0..999`: **zero invalid scenarios**, **678 distinct cargo layouts**, and **92 distinct stock layouts**. The fixed comparison set is **3, 7, 42, 99, 2026, 4821**. It contains both three- and four-pallet shipments and varied existing stock. These checks establish logical feasibility; the Phase 2 controller run must still prove drivable trajectories with the actual collision model.

Both modes receive the same initial state for a chosen seed. Predictable mode must reproduce its outcome from that seed. An exact Full Laya replay also records each response, command and timestamp; a seed alone is not an exact model-output recording.

## Full Laya control contract

Laya makes **task and control** choices. Code may calculate geometry, enumerate legal candidates and describe relative positions in words; it does not choose a steering action in Full Laya mode. The local endpoint is `POST http://127.0.0.1:8000/v1/systemone`. The [API probe](laya-probe.json) used the running English model on Apple MPS.

| Decision | Candidate vocabulary | Cadence |
| --- | --- | --- |
| Task | Currently accessible truck pallets and empty bays, each with a short description; include a stop/unsure option. | On pickup, placement, or rejected target. |
| Travel | `forward cruise`, `forward creep`, `reverse cruise`, `reverse creep`, `stop`; steering `left`, `straight`, `right`. | Initially every 250 ms of simulation time, adjusted to measured latency. |
| Forks/load | `raise`, `lower`, `hold`; `pickup`, `place`, `none`. | At decision ticks near target poses. |

The observation includes the current task, whether the forklift carries a load, route region, target bearing (`left/ahead/right`), range (`far/near/aligned`), obstacle clearance, fork height relative to target, and bay availability. Code turns raw distances and angles into those words before asking Laya. Keep options short and batch related typed questions in one request. The selected command is held until the next decision, capped at 500 ms; on a late response the forklift brakes. Cancel or ignore responses from a prior reset generation. This is a starting policy contract, not a measured closed-loop success claim.

Physical rejection is the only safety layer in Full Laya mode. Rejected actions increment counters and appear in the inspector. No predictable route or steering controller takes over. A run pauses with a reason after three consecutive request failures/timeouts, ten rejected actions in a rolling 30 s window, no route/task progress for 15 simulated seconds, or 300 simulated seconds without completion. Progress means a pickup, placement, or a reduction of at least 0.15 m in target-approach distance. These provisional limits should be tuned on the fixed comparison seeds.

Completion requires all incoming cargo in distinct storage bays, no carried pallet, and no incoming cargo left in the truck. Record delivered count, elapsed simulated time, wall-clock time, valid/invalid actions, contact rejections, Laya response median/p95 and final outcome. Predictable mode should complete all six reference seeds within 180 simulated seconds; Full Laya completion rate and failure categories are measured rather than assumed. Low probability or ambiguous responses should be shown and can result in `stop`; the threshold must be chosen from a larger Phase 4 fixture set.

## Laya probe result

The probe sent 12 labelled situations (four navigation, four pickup, four placement), each with three question phrasings: **36 successful API calls**. Calls were serial and the first included warmup. Overall median was **31 ms**, p95 **140 ms**, maximum **1,064 ms**. These times cover local HTTP and model response on this machine; they are not a guaranteed control rate.

| Situation | Direct-action question | Best tested descriptive/condition question | Observed mistake |
| --- | --- | --- | --- |
| Navigation | 2/4 correct | 3/4 correct | “Ahead and slightly left” was classified as ahead in every tested wording. |
| Pickup | 3/4 correct | 4/4 correct | Direct question rejected a ready pickup; one phrasing accepted an offset pallet. |
| Placement | 3/4 correct | 3/4 correct | Direct question rejected a ready placement; condition wording accepted a too-high fork in one case. |

The tiny fixture is enough to expose wording risk, not enough to certify direct control. Phase 4 needs more varied labelled states and closed-loop runs. The model's own probabilities cannot override pickup/placement geometry checks. A wrong answer should appear as an invalid command or a pause, not a hidden deterministic correction.

Run again with `node scripts/warehouse-phase0/probe-laya.mjs` while the local service is running. The script writes the full responses, probabilities, timings and errors to [laya-probe.json](laya-probe.json).

## Visual reference and asset list

The [top-down sheet](layout-and-style.svg) uses the SLAM demo's dark blue-gray shell, mint accents, cool metal, warm wood pallets and restrained lighting. The default camera must reveal cargo at the truck mouth and storage occupancy without constantly switching views. Small labels, bay numbers and a short route trace provide legibility; the forklift and moving load remain the focal point.

Blender kit for Phase 3: cutaway floor/walls/columns, dock lip/door, delivery truck with open cargo bed, eight-bay rack, two pallet variants with interchangeable labels, forklift chassis, four wheel pivots, steerable rear axle, overhead guard, mast, fork carriage, status lights, industrial task fixtures and a small reusable prop set. Named pivots and collision footprints belong in the export manifest. The user will enable Blender MCP during asset work; Phase 0 does not assume it is connected.

## WebGPU stack and browser evidence

The committed Phase 0 probe in `apps/warehouse-demo` pins **Three.js 0.185.1**, **React Three Fiber 10.0.0-alpha.5**, **Drei 11.0.0-alpha.7**, **React 19.2.7** and **Vite 8.1.2**. It uses `@react-three/fiber/webgpu`, `@react-three/drei/webgpu` and `three/webgpu`. In R3F v10's WebGPU entry, the Canvas prop is `renderer`, rather than the v9 `gl` prop; the first browser attempt exposed this and was corrected. `pnpm -C apps/warehouse-demo build:probe` passes.

The probe ran in **Google Chrome 153 headless on a MacBook Pro with Apple M3 Pro and 18 GB RAM**. The [browser report](webgpu-probe.json) records `navigator.gpu`, an adapter, and `renderer.backend.isWebGPUBackend === true`. The screenshot shows a Draco-compressed Blender GLB with its materials, a cast shadow, standard mesh material and the Drei orbit control. Dragging changed the view, and the canvas unmounted/remounted with a WebGPU backend and no page errors. The current R3F alpha emitted two scheduler “root not found; invalidation ignored” warnings during remount; the scene remained functional, but Phase 5 should recheck repeated lifecycle changes for leaks. A [simulated unavailable-WebGPU run](webgpu-disabled-probe.json) hid `navigator.gpu`: Three.js silently used its WebGL 2 backend and still loaded the scene. The production app must detect this and show an explicit unsupported-WebGPU state rather than present that fallback as the target renderer.

Run the probe with `pnpm -C apps/warehouse-demo dev:probe`, then `node scripts/warehouse-phase0/probe-webgpu.mjs`; pass `--disable-webgpu` to simulate the unavailable path. The current probe reuses the SLAM workbench GLB and Draco decoder through Vite's temporary `publicDir` setting. Phase 1 should replace this probe-only asset path with app-owned assets. The alpha stack adds large renderer/chunk output (roughly 966 kB and 1,053 kB for its two largest uncompressed chunks); measure and trim delivery in later phases.

Use standard glTF PBR materials and the tested Drei GLB loader and controls first. Three.js [does not support legacy `ShaderMaterial`, `RawShaderMaterial` or `onBeforeCompile` customizations in WebGPURenderer](https://threejs.org/manual/pages/webgpurenderer); any later custom effect should use its node/TSL path and receive its own browser check. No postprocessing effect is required for the first visual pass.

## Review gate

Phase 0 establishes the layout, explicit state and action rules, reproducible scenario fixtures, measured Laya wording risk, and an actual WebGPU browser render. The next phase is the deterministic simulation/app shell. **Stop here for user review before Phase 1.**
