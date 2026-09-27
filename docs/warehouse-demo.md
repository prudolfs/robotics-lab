# Warehouse Demo

> Implementation plan for a browser-first autonomous forklift that unloads a delivery truck into a compact warehouse. The visitor can run the same randomized shipment with a predictable controller or Full Laya control.
>
> Status: Phase 0 completed and awaiting user review. Phases 1–6 remain planned. See the [Phase 0 review](warehouse-demo/phase0/README.md) before continuing.

## Goal and experience

The visitor starts a delivery, watches a forklift collect pallets from the truck, drive through a short warehouse aisle and place them in available storage bays. The experience is visual and autonomous: there is no manual driving or manual task planning. Start, pause, restart, randomize and control-mode selection are the main controls.

Each seed defines both the cargo order and placement in the truck and the stock already occupying warehouse bays. The same seed can be run in either mode. A small inspector shows the current goal, selected action, progress, and why a run completed or paused.

The graphics should feel like the [SLAM demo](slam-demo.md): an authored industrial scene, cool materials, warm task lights, a spacious cutaway viewport and restrained overlays. The warehouse is intentionally small. Motion, picking and placement are the visual focus.

## Agreed scope

- One truck at a flush loading dock, one forklift, a short aisle and one compact storage rack. Start with roughly three or four incoming pallets and six to eight accessible single-level bays; tune counts after the layout is tested.
- Existing stock occupies a seeded subset of bays. It affects available capacity. Pallet labels and colors help the viewer follow cargo, but there are no cargo-type matching rules in the first release.
- Generate only feasible starting conditions: every incoming pallet has an available bay, and at least one reachable pallet can be retrieved at each unload step. Cargo order should visibly affect the sequence of work.
- Use a simple forklift motion model with steering, forward/reverse travel, mast lift and pallet pickup/placement. Ground contact, collision and load attachment are coherent, without attempting industrial-grade vehicle or load physics.
- Provide two fully autonomous modes. **Predictable** uses a deterministic task selector and route/steering controller. **Full Laya** uses Laya for task, destination and discrete forklift control decisions. The simulator enforces physical limits in both modes, but does not secretly switch Full Laya to the predictable controller.
- If Full Laya makes no progress, repeatedly requests invalid actions, times out or cannot finish, pause and explain the failure. The visitor can restart the same seed or try the other mode.
- The initial integration uses the user's locally running Laya server at `http://127.0.0.1:8000/v1/systemone`. Predictable mode must work when it is unavailable; Full Laya shows a clear connection/loading state.

## Technical direction and tradeoffs

| Area | Direction |
| --- | --- |
| App | New `apps/warehouse-demo` Vite/React/TypeScript app in the pnpm workspace. Reuse useful SLAM presentation patterns, not its stereo or mapping pipeline. |
| Rendering | Three.js `WebGPURenderer` through React Three Fiber v10 alpha's WebGPU entry, with a compatible React Three Drei v11 alpha. Use WebGPU as the actual backend, not merely a renderer that has fallen back to WebGL 2. Keep versions pinned together after the Phase 0 probe. |
| Simulation | Framework-independent fixed-timestep world state and seeded scenario generation. Keep simulator truth, control decisions and React presentation separate. |
| Movement | A small drivable lane/waypoint model and deterministic steering controller for Predictable mode. Use a simple forklift kinematic model rather than a full rigid-body vehicle simulation. |
| Pallets | Explicit pickup and placement preconditions, fork height and alignment checks, carried-load state and bay occupancy. Animate the same state the simulation uses. |
| Laya | A local HTTP adapter sends short, qualitative state descriptions and typed questions. Code computes distances, angles and feasibility before phrasing them; Laya chooses among small, named options. Batch related questions in one request where useful. |
| Full Laya | At bounded decision intervals, Laya chooses a reachable pallet/bay and discrete commands such as forward/reverse/stop, left/straight/right, and lift/lower/hold or pickup/release. Commands are held until the next decision. Invalid commands are rejected by physical rules and recorded. No route controller takes over. |
| Replay | A seed reproduces starting conditions. Exact Full Laya playback additionally needs a recorded decision trace; timing and model responses are not assumed deterministic from the seed alone. |

Laya is a text decision model, not a vision or continuous motor-control system. Its [integration guidance](https://brainfunctioncollapse.com/laya) warns that wording can change answers and that it does not reliably compare raw numbers. A local probe also classified a target described as “ahead and slightly to the left” as “ahead.” Full Laya therefore needs measured prompt variants, bounded command rates, visible rejected actions and honest failure states. If the feasibility gate shows that direct commands cannot complete representative runs, keep that result visible and narrow the action vocabulary or observation wording; do not relabel deterministic steering as Full Laya.

The local service makes Full Laya a local-first feature. A remotely hosted copy would need a separately deployed decision service or an explicit local companion setup. Do not make the browser silently depend on an unreachable loopback address.

React Three Fiber v10 and Drei v11 are prereleases. The [R3F v10 releases](https://github.com/pmndrs/react-three-fiber/releases) describe first-class WebGPU support, while [Three.js documents](https://threejs.org/manual/pages/webgpurenderer) that `WebGPURenderer` may fall back to WebGL 2 automatically. Pin a tested Three.js/R3F/Drei combination, verify the active backend in the browser, and show an explicit capability message when WebGPU is unavailable. Favor standard GLB materials and proven Drei helpers; evaluate shadows, controls, loading and any effects under WebGPU before committing the asset pipeline. Keep these alpha dependencies app-local so the existing SLAM demo remains on its current renderer stack.

## Visual and interaction direction

Use an open cutaway of a small warehouse with a docked truck, a visible cargo bed, one short rack and clear travel lanes. Give the forklift a recognizable mast, forks, wheels, overhead guard and status lights. Pallets should be easy to distinguish in the truck and rack. Keep all key movements readable from a default overview camera; provide a follow camera and a dock/rack detail camera only if they improve the action.

Keep the UI compact: mode and seed near Start/Restart/Randomize, a shipment progress count, current cargo and destination, a short event timeline, and a small Laya decision readout. Show the selected command, response age and probability when in Full Laya mode. Display collisions, invalid pickups, blocked bays and stalls in plain language. Avoid turning the main viewport into a debugging dashboard.

Blender is the asset authoring tool. The user plans to open Blender and enable Blender MCP while working on asset tasks. Check tool availability and connectivity at that phase; retain an editable `.blend` source and repeatable Blender Python/export path. Use GLB for runtime meshes and a shared manifest for dimensions, collision footprints, cargo slots, bays and named animation pivots. Review browser screenshots, not only Blender renders.

## Implementation phases

### Phase 0 — Scenario and Laya feasibility

Goal: settle the smallest convincing layout and prove that the proposed Full Laya action loop is viable enough to build around.

- [x] Sketch the top-down dock, truck, forklift aisle and rack layout; specify dimensions, approach clearances and the default camera view.
- [x] Define forklift pose, steering, speed, fork height, carried load, pallet positions, bay occupancy and run-state units/conventions.
- [x] Define seeded scenario rules for cargo order/placement and pre-existing stock; generate sample seeds and check reachable cargo and sufficient bays.
- [x] Specify the discrete Full Laya action vocabulary, qualitative observations, decision rate, timeout behavior and physical rejection rules.
- [x] Probe the live `/v1/systemone` API with representative navigation, pickup and placement situations. Compare a few phrasings and record response time, correct-choice rate and common mistakes.
- [x] Define measurable completion, stall and invalid-action criteria, plus a fixed seed set for controller comparison.
- [x] Record a visual reference and asset list that matches the SLAM demo's palette and level of detail.
- [x] Spike a minimal Three.js WebGPU scene through R3F v10 alpha and compatible Drei v11 alpha; verify the active backend, canvas lifecycle, controls, GLB materials and shadows in the reference browser.
- [x] Pin compatible prerelease versions and record WebGPU capability behavior and any unsupported material/effect choices before asset production.

Exit verified: the [Phase 0 review](warehouse-demo/phase0/README.md) documents the layout, 1,000 valid generated seeds, 36 live Laya decisions, and an active WebGPU browser render. Stop for user review before Phase 1.

### Phase 1 — App shell and deterministic warehouse world

- [ ] Scaffold `apps/warehouse-demo`, workspace scripts, app-local styling and a scene shell using the verified Three.js WebGPU, R3F v10 alpha and Drei v11 alpha combination.
- [ ] Initialize the WebGPU canvas asynchronously, confirm the active backend and show a clear capability/error state instead of silently presenting a WebGL 2 run as WebGPU.
- [ ] Implement fixed-timestep world updates and seeded scenario generation outside React; add start, pause, restart-same-seed and randomize-new-seed.
- [ ] Build placeholder truck, dock, rack, pallets and forklift meshes at real scale, with overview/follow camera controls.
- [ ] Implement forklift steering, forward/reverse travel, fork height and collisions with walls, rack, truck and pallets.
- [ ] Implement pickup/carry/place transitions using explicit fork alignment, height, reach and bay-availability checks.
- [ ] Show shipment count, current load, bay occupancy and event/status messages from actual simulation state.
- [ ] Test seed validity, fixed-step reproducibility, collision bounds, pickup/placement preconditions and reset state.

Exit: a repeatable, interactive warehouse simulation can complete a pallet transfer with placeholder geometry.

### Phase 2 — Predictable autonomous unloading

- [ ] Add a deterministic task selector that chooses an accessible truck pallet and an empty reachable bay using a documented tie-break rule.
- [ ] Build a short route graph with approach poses for cargo pickup, dock transit and bay placement.
- [ ] Implement steering, speed, stopping and fork sequencing along that route; include bounded recovery for small alignment errors.
- [ ] Keep task selection and motion logic independent from rendering and UI state.
- [ ] Show current phase and goal in the inspector, with simple route/target overlays that can be hidden.
- [ ] Verify completion across the fixed seed set, including different cargo orders and pre-filled bays; record run time and any failure reasons.

Exit: Predictable mode unloads every valid seed in the reference set without manual input.

### Phase 3 — Blender assets and browser visual pass

- [ ] Check Blender MCP connectivity when the user enables it; use Blender Python scripts for repeatability and as a fallback.
- [ ] Model the cutaway shell, loading dock, truck cargo bed, short storage rack, pallets and forklift with separate wheel, steering, mast and fork pivots.
- [ ] Add a restrained industrial material set, purposeful labels and lighting consistent with the SLAM demo.
- [ ] Export optimized GLBs plus a manifest of cargo slots, bays, pivots and collision shapes; keep editable sources and export scripts.
- [ ] Integrate animated forklift motion, fork lift, pallet attachment/placement, truck cargo and existing stock with simulation state.
- [ ] Review overview, follow, truck-pickup and rack-placement screenshots in the browser; fix readability and mesh/collision alignment.
- [ ] Measure load time and frame rate on a named WebGPU-capable reference browser/device; reduce asset cost if needed.

Exit: the predictable run looks and reads like a finished small industrial scene, with visible pickup and placement rather than teleporting cargo.

### Phase 4 — Full Laya control

- [ ] Add a typed client for the local Laya endpoint, request validation, cancellation/generation IDs on restart and bounded in-flight requests.
- [ ] Convert simulator state into concise qualitative descriptions, calculating geometry and legal candidates in code before asking Laya.
- [ ] Let Laya choose the next accessible cargo and available bay, then issue discrete travel, steering and fork commands at the measured decision rate.
- [ ] Enforce only simulation invariants and physical constraints on those commands. Log rejection reasons; do not invoke the predictable route controller in this mode.
- [ ] Brake or hold safely on delayed/failed responses, and pause with a specific explanation after bounded no-progress, repeated invalid actions or unrecoverable decisions.
- [ ] Show Laya connection state, current decisions, probabilities, response age and rejected actions in a compact inspector.
- [ ] Compare both modes on the same seed set; report Full Laya completion rate, intervention-free transfers, decision latency and failure types. Revise prompts/action vocabulary based on those results.

Exit: Full Laya visibly controls at least representative complete unload runs, and its failures are observable rather than hidden. If it cannot do so reliably, document the measured limit before changing the scope.

### Phase 5 — Scenario controls, comparison and polish

- [ ] Finalize seed display, randomize, restart-same-seed and mode selection. Changing mode restarts the run so both controllers begin from identical conditions.
- [ ] Add a compact run summary: delivered pallets, elapsed simulated time, collisions/invalid actions, pauses and outcome.
- [ ] Support comparison by rerunning the same seed in the other mode; keep side-by-side visualization optional rather than doubling the scene workload.
- [ ] Record decisions and timestamps for an exact Full Laya playback path, clearly distinguishing playback from a fresh model run.
- [ ] Refine camera handoff, focus states, responsive layout, reduced motion and readable non-color status cues.
- [ ] Check repeated starts, resets, randomizations, mode switches and local-service disconnects for stale responses or leaked render resources.

Exit: visitors can understand what happened, replay a shipment and compare the two autonomous modes fairly.

### Phase 6 — Verification and release

- [ ] Run targeted simulation/controller tests, app typecheck/build and relevant shared-package regressions.
- [ ] Add a small public-UI end-to-end suite for start, seeded restart, randomization, predictable completion, mode switch and unavailable Laya service.
- [ ] Capture representative browser screenshots and a short full-run recording; verify visual quality and performance on the reference setup.
- [ ] Verify the deployed build uses the WebGPU backend on supported hardware and explains unsupported browsers/devices clearly.
- [ ] Document architecture, Blender source/export workflow, local Laya startup/endpoint configuration, measured controller results and known limits.
- [ ] Add an app README and root README launch instructions once the app exists.
- [ ] Verify a clean local startup and full unloading run from the documented commands.

Exit: a shareable browser demo with a dependable autonomous baseline and an honest, measurable Full Laya mode.

## Completion criteria

- [ ] A fresh visitor can start a run and watch the forklift move every incoming pallet from truck to available warehouse storage without manual control.
- [ ] Randomizing changes both truck cargo order and existing bay occupancy while always producing a feasible scenario.
- [ ] Restarting the same seed restores the same initial world; Predictable mode reproduces the same outcome.
- [ ] Full Laya controls task and forklift commands through the local endpoint, exposes its decisions and pauses with an explanation when it cannot progress.
- [ ] Pallet attachment, fork movement, truck access, collisions and storage occupancy agree between simulation and rendered scene.
- [ ] The browser scene maintains the SLAM demo's visual language without adding unrelated robotics systems.
- [ ] The warehouse scene runs on Three.js WebGPU through R3F v10 alpha and compatible Drei helpers on the reference browser.

## Later possibilities

- [ ] Multi-level racks, cargo compatibility rules or truck loading as a second mission.
- [ ] More forklifts, people or moving obstacles after the single-vehicle flow is stable.
- [ ] Hosted Laya service for a public remote Full Laya demo.
- [ ] Fine-tuning or learned policy work if measured zero-shot Full Laya results justify it.
