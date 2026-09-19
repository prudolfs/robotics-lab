# Visual SLAM Demo

> Implementation plan for a browser-first stereo visual SLAM explorer with a Blender-authored robotics lab, live feature tracking, sparse reconstruction and visible loop closure.
>
> Status: Phases 0–4 implemented and verified; Phase 4 awaits user review. Phases 5–10 remain planned. Phase 4 processing exceeds the initial 30 ms/pair target; measured limits are documented in its review.

## Goal and experience

Build an interactive explanation of simultaneous localization and mapping: a robot observes an unfamiliar environment, estimates its motion, builds a sparse 3D map and corrects accumulated drift when it recognizes a previously visited place.

The default experience is a guided inspection loop through a detailed robotics lab. The visitor starts the run, watches features move through the stereo camera feed, sees landmarks and keyframes accumulate, then watches a verified loop closure correct the estimated trajectory. Manual driving, failure scenarios and replay make the same systems explorable.

Graphics are a core deliverable from the beginning. Aim for a polished real-time industrial visualization: believable materials, authored architecture, deliberate lighting and restrained scientific overlays. The environment should look good from the robot's eye level as well as the overview camera.

## What the repository already provides

| Existing foundation | Reuse and limitations |
| --- | --- |
| [Project philosophy](project.md) | Functional TypeScript, browser-first apps, framework-independent simulation, React for presentation and Zustand for UI. Use the actual pnpm workspace; the older Bun stack entry is historical. |
| [Robot simulator plan](simulator.md) and `packages/robot` | Differential-drive motion, encoder odometry and deterministic noise provide the robot and comparison baseline. Existing localization is dead reckoning, not visual SLAM. |
| `packages/sensors` and `packages/rendering/src/robot-camera.tsx` | Lidar and drone sensor models, plus a rendered camera viewport. The viewport is presentation infrastructure; calibrated stereo pixel capture and visual feature processing must be added. |
| `packages/maps`, `packages/geometry`, `packages/occupancy-grid` | Reuse world footprints and collision helpers where appropriate. Existing maps are primarily 2D; occupancy mapping is not a sparse visual reconstruction. |
| `packages/core`, `packages/math` | Reuse common primitives. Current `Pose` is 2D and math helpers are small; 3D rigid transforms and numerical solvers are new work. |
| `packages/rendering` and [drone planner](drone-mission-planner.md) | Reuse suitable views and camera interaction patterns. Simulator uses WebGL; drone planner has a WebGPU renderer. Neither proves compatibility with the proposed stereo capture and effects. |
| [HUD plan](hud.md) | Reuse panel/widget lessons and app-local shadcn components without making the new app depend on another app. |
| [E2E strategy](e2e.md), [world clicks](e2e-world-click.md), [CI notes](playwright-on-github-actions.md) | Vitest for algorithms; a small Playwright suite using public controls and renderer-projected clicks. |

`apps/slam-demo` now contains motion, authored lab graphics and calibrated stereo acquisition. Pure stereo geometry and sensor models live in `packages/sensors`; shared vision and visual SLAM packages have not been created. Existing milestone checkboxes are historical planning records; verify relevant code before reuse.

## Scope and technical direction

The initial release uses a differential-drive ground robot carrying a calibrated stereo camera pair in a static indoor environment. Motion is planar, but camera poses and reconstructed landmarks use 3D transforms. Stereo is the proposed starting point because its known baseline supplies metric scale. Monocular scale recovery, visual-inertial fusion, dense reconstruction, ROS and hardware integration are later extensions.

Two clearly labeled input modes support development:

- **Synthetic observations:** projected feature measurements with seeded noise for controlled algorithm tests and an early educational prototype. Known correspondences, when used, are explicitly identified as an oracle assumption. This is not image-based feature tracking.
- **Rendered stereo images:** actual pixel buffers feed detection, matching, triangulation and pose estimation. This is the required default for the finished visual SLAM demo.

The estimator receives observations or images, calibration and timestamps. It never receives simulator ground-truth poses, world landmark coordinates, object IDs, depth buffers or precomputed loop matches. Ground truth belongs to the simulator and evaluator only. Wheel odometry is a separate comparison baseline; any later fusion must be a named mode.

Proposed package boundaries:

```text
apps/slam-demo/             UI, world composition, capture adapter, workers, recordings
packages/vision/            image features, matching, stereo geometry; no React/browser APIs
packages/slam/              tracking, keyframes, landmarks, optimization, loop closure
packages/sensors/           calibrated camera types and synthetic observation models
packages/math/              tested rigid transforms and numerical helpers as needed
packages/rendering/         genuinely reusable frustum, point and trajectory views
assets/slam-demo/           Blender sources, export scripts, asset manifest and licenses
apps/slam-demo/public/      optimized runtime models, textures and environment assets
```

The application, stereo sensor utilities and production asset paths are implemented through Phase 3; the vision/SLAM packages remain proposed additions. Browser workers adapt the pure packages; simulation and estimator state stay outside Zustand. Do not generalize every app component into a package before it has a clear reusable interface.

## Visual direction and Blender workflow

The hero environment is a compact inspection lab with a central equipment island and a continuous loop route. Distinct workbench, storage and charging areas provide recognizable revisits. Use modular wall bays, structural columns, overhead services, cabinets, cable trays, crates and a few carefully modeled instruments. Texture and silhouette variation should support visual matching; repetitive shelving and blank walls become deliberate challenge areas.

The robot gets a custom chassis, animated wheels, a visibly separated stereo rig, lens housings and small status lights. Materials combine painted metal, brushed metal, rubber, glass and a subtly worn floor. Favor warm task lights against a cooler ambient environment, soft contact shadows and restrained emissive accents. Keep the main viewport spacious with compact inspector panels and legible units.

Blender is the authoring tool. [Blender MCP](https://blendermcp.org/) can assist with scene construction, materials and camera setup; its site also documents Python execution. Treat it as an optional authoring connection, not a runtime dependency. Opening Blender alone does not establish that connection. During implementation, check available tools and connectivity before attempting to operate the scene; a repeatable Blender Python script is the fallback workflow.

Use glTF/GLB as the proposed delivery format. Preserve editable `.blend` sources and export scripts separately from optimized runtime assets. Bake unsupported procedural materials into texture maps and inspect the result in the browser; a Blender render is not the visual acceptance target.

Provisional budgets, to confirm on named hardware in Phase 0:

| Area | Starting target |
| --- | --- |
| Presentation | 60 FPS at 1440×900 on the chosen reference laptop; 30 FPS low preset |
| Sensor stream | Synchronized 640×480 stereo pairs at 10 Hz; fixed calibration per run |
| Tracking | Sustain the sensor rate with bounded queues; expose processing latency |
| Scene | At most 500k visible triangles and 200 draw calls on the standard preset |
| Delivery | At most 25 MB compressed initial assets/code; larger optional assets loaded later |
| Map | Start with caps of 200 keyframes and 20k active landmarks; cull or archive explicitly |

These are planning targets, not measured claims. Reduce expensive presentation effects before silently changing the sensor stream. Sensor resolution changes require updated calibration and a fresh run. Reference fixture replay must remain independent of graphics quality.

## Implementation phases

### Phase 0 — Feasibility, conventions and visual specification

Goal: resolve the highest-risk numerical and rendering choices before producing the full scene.

- [x] Write the guided loop storyboard, viewport layout and visual reference sheet with robot, materials, lighting and overlay treatments.
- [x] Define meters/radians, timestamps, transform direction, camera optical axes and adapters for the existing 2D world, Three.js scene and Blender exports; test handedness and round trips.
- [x] Specify stereo intrinsics, baseline, robot-to-camera extrinsics, capture rate and the initial route length/speed.
- [x] Spike a pixel-to-pose pipeline on a short recorded stereo sequence; compare a TypeScript implementation with an OpenCV/WASM adapter for required operations, download size and worker compatibility.
- [x] Verify the chosen build actually exposes needed feature, triangulation and pose functions; do not assume native OpenCV APIs all exist in JavaScript bindings.
- [x] Compare WebGL2 and WebGPU for stereo render targets, readback, R3F integration and required postprocessing; choose and document one baseline with capability/error behavior.
- [x] Establish named reference hardware/browser, benchmark procedure, numerical tolerances and per-stage frame/memory budgets.
- [x] Confirm Blender version, export path and whether Blender MCP is available; record the scripted fallback.

Exit verified: a recorded stereo fixture yields measured pose estimates, the Blender material/capture sample works in-browser, and implementation choices are recorded in the [Phase 0 report](slam-demo/phase0/README.md). Review the [visual specification](slam-demo/phase0/visual-reference.svg) and [browser sample](slam-demo/phase0/browser-probe.png) before beginning Phase 1.

### Phase 1 — App shell and deterministic simulation

- [x] Scaffold `apps/slam-demo` with Vite, React, TypeScript, workspace scripts, UI tokens and a dedicated Playwright configuration.
- [x] Build the main scene, camera-feed slot, compact inspector and bottom playback/status strip.
- [x] Reuse robot kinematics with a fixed timestep, seeded noise, pause/resume/reset and manual control.
- [x] Create a simple collision world and scripted inspection loop with repeatable input commands.
- [x] Introduce separate simulator truth, encoder-odometry baseline and estimator snapshots; use Zustand only for controls and presentation preferences.
- [x] Show truth and odometry trails with a labeled legend and a camera-follow mode.
- [x] Verify deterministic motion in Vitest and start/pause/reset through the UI in Playwright.

Exit verified: a repeatable robot run works with placeholder geometry and responsive controls. See the [Phase 1 review](slam-demo/phase1/README.md), [app instructions](../apps/slam-demo/README.md), and [desktop screenshot](slam-demo/phase1/desktop.png). Stop for user review before Phase 2.

### Phase 2 — Blender assets and the first polished scene

- [x] Author the modular lab blockout at real scale, preserving a clear loop route and robot camera sightlines.
- [x] Model the robot with separate wheel pivots and named stereo mounts; validate dimensions against calibration.
- [x] Build one finished workbench/cabinet area to approve the browser material and lighting treatment before expanding the kit.
- [x] Add UVs, baked PBR textures, useful detail normals and a controlled material palette; avoid unnecessary unique materials.
- [x] Export visual meshes, simplified collision footprints and named spawn/route anchors from a shared manifest so visuals and simulation remain aligned.
- [x] Add stable asset IDs, licensing/attribution records, source `.blend` files and reproducible export scripts.
- [x] Add instancing or merged static geometry, suitable detail levels and texture/model compression supported by the selected renderer.
- [x] Integrate the complete lab, wheel animation, overview/follow cameras, lighting and loading/error states.
- [x] Review robot-eye and overview screenshots in the browser and measure the asset/render budgets.

Exit verified: the real app already presents the intended visual quality, with aligned collisions and calibration mounts.

Review evidence: [Phase 2 screenshots, validation and measured budgets](slam-demo/phase2/README.md), [editable Blender assets and export instructions](../assets/slam-demo/README.md). Stop for user review before Phase 3.

### Phase 3 — Calibrated stereo acquisition

- [x] Add synchronized left/right capture at fixed simulation timestamps, using the same robot pose for both exposures.
- [x] Implement projection/unprojection and synthetic observation fixtures with visibility, occlusion, image noise and dropout controls.
- [x] Build the browser capture adapter and buffer ownership protocol without coupling pure packages to Three.js or DOM APIs.
- [x] Keep camera frames free of debug overlays, landmark markers, presentation bloom, cinematic depth of field and display-only camera motion.
- [x] Apply sensor noise to actual input pixels; a decorative overlay on the camera pane does not count as image noise.
- [x] Use a worker with bounded queues, timestamped outputs, reset generation IDs and explicit backlog/drop behavior; provide a lockstep fixture mode.
- [x] Display the exact processed frame with synchronized overlays and make input mode, capture rate and latency visible.
- [x] Test projection, stereo alignment, occlusion, frame ordering and resets while work is pending.

Exit verified: calibrated stereo pairs reach the processing pipeline reliably, and a recorded input sequence can be replayed without rendering.

Review evidence: [Phase 3 screenshots, calibration checks and ownership contract](slam-demo/phase3/README.md), [exact offline replay](slam-demo/phase3/replay.json). Stop for user review before Phase 4.

### Phase 4 — Feature tracking and stereo visual odometry

- [x] Implement the selected corner/descriptor frontend, spatial feature coverage and frame-to-frame matching.
- [x] Match stereo features with epipolar/disparity checks, reject ambiguity and triangulate only well-conditioned positive-depth points.
- [x] Estimate camera motion from tracked 3D-to-2D correspondences using robust outlier rejection and pose refinement.
- [x] Add initializing/tracking/degraded/lost states based on observable inlier and residual checks; never replace failed estimates with truth.
- [x] Bound feature counts and reuse buffers; dispose of native/WASM allocations explicitly if applicable.
- [x] Render tracked features, rejected matches and reprojection residuals in the camera pane; show visual and encoder odometry separately.
- [x] Test known motion, outliers, low disparity, pure rotation, blank frames and insufficient features on fixed fixtures.

Exit verified: image-derived visual odometry follows the route with measured error and honest tracking failures. Label this milestone as visual odometry until mapping and loop closure exist.

Review evidence: [Phase 4 screenshots, fixed fixtures, full-route error and processing limits](slam-demo/phase4/README.md). Stop for user review before Phase 5.

### Phase 5 — Keyframes and persistent sparse mapping

- [ ] Create keyframes based on motion, feature overlap and tracking quality; store observations and calibrated poses.
- [ ] Maintain persistent landmark IDs, descriptors, observation links and quality scores without exposing simulator IDs.
- [ ] Track against the local map and triangulate/fuse new observations; cull duplicates, unstable landmarks and redundant keyframes.
- [ ] Implement bounded local bundle adjustment with robust loss, a fixed reference frame and safeguards for singular/non-improving solutions.
- [ ] Publish coherent versioned map snapshots so poses and landmarks are never displayed from different optimization revisions.
- [ ] Add instanced sparse points, keyframe frusta and selection inspectors showing actual observations and residuals.
- [ ] Test map consistency, memory caps and reprojection-error improvement on controlled fixtures.

Exit: a persistent sparse map supports continued tracking and local refinement within the chosen compute budget.

### Phase 6 — Place recognition and loop closure

- [ ] Build appearance-based keyframe retrieval with temporal exclusion and a bounded database.
- [ ] Geometrically verify candidate revisits using descriptor correspondences and robust 3D constraints; reject repeated-looking but different areas.
- [ ] Add verified constraints to an SE(3) pose graph, anchor its gauge and solve with robust weighting and bounded iterations.
- [ ] Reconcile landmark positions, duplicate landmarks, the active local map and ongoing tracking after graph correction; follow with local refinement.
- [ ] Show candidate, verified, rejected and applied events distinctly, with pre/post trajectories and residual summaries.
- [ ] Animate correction only in the presentation layer while preserving the committed estimator result.
- [ ] Run the same seeded image sequence with closure enabled and disabled; evaluate trajectory error using a common fixed frame alignment and verify improvement across several fixtures.
- [ ] Test a true revisit, a visually similar false candidate and a no-loop route; ensure truth proximity never triggers a closure.

Exit: revisiting the lab genuinely improves the estimated map and trajectory, with evidence visible in the UI.

### Phase 7 — Relocalization and guided experiments

- [ ] Relocalize against saved keyframes after tracking loss using appearance retrieval and geometric verification.
- [ ] Add guided scenarios for the standard loop, a low-texture wall, repetitive storage bays and increased pixel noise/dropouts.
- [ ] Explain tracking loss, rejected closures and recovery in a compact event timeline with inspectable evidence.
- [ ] Add presets for scene + camera + algorithm parameters + seed, with restart behavior for calibration-changing settings.
- [ ] Add a guided walkthrough connecting camera observations, motion estimates, map growth and loop correction.
- [ ] Test recovery in a known place and honest failure in an unseen/featureless view without resetting the estimate to ground truth.

Exit: visitors can reproduce and understand both successful operation and failure/recovery.

### Phase 8 — Recording, replay and quantitative comparison

- [ ] Define a versioned recording containing calibration, seed, scene/asset versions, commands, timestamps, input mode and algorithm settings.
- [ ] Support exact captured-image/observation replay for evaluation; distinguish it from command-only re-simulation, whose GPU pixels may vary across devices.
- [ ] Store estimator checkpoints and RNG state where needed for seek/resume; document payload limits and optional frame storage.
- [ ] Implement play/pause, stepping and timeline scrubbing with stale-worker cancellation and bounded resources.
- [ ] Export/import recordings and sparse maps with schema validation and clear incompatible-version errors.
- [ ] Display trajectory error, tracking availability, reprojection error, accepted/rejected closures and processing latency; define alignment and units beside the metrics.
- [ ] Verify reset/replay reproducibility on fixed inputs within numerical tolerances and compare closure-on/off results.

Exit: a saved run can be inspected and evaluated reproducibly without depending on the live renderer.

### Phase 9 — Graphics, accessibility and performance finish

- [ ] Refine environmental storytelling, surface wear, contact shadows and reflection treatment without reducing feature readability.
- [ ] Add restrained presentation effects supported by the selected renderer; keep sensor capture on its calibrated pipeline.
- [ ] Polish orbit/follow/robot/inspection cameras and a short optional opening shot that yields immediately to user input.
- [ ] Refine depth-aware points, dashed/solid trajectory styles, selected keyframes and a clear legend; do not rely on color alone.
- [ ] Add keyboard-accessible controls, focus states, reduced motion, readable contrast and responsive panel layouts.
- [ ] Profile the full stereo + tracking + map + presentation workload; tune quality presets, worker copies, point batches and culling.
- [ ] Test repeated resets, scenario swaps and replay seeks for growing GPU/WASM/worker memory; release textures, buffers and workers correctly.
- [ ] Capture final standard/low preset screenshots and verify the agreed frame, latency, memory and delivery budgets.

Exit: the complete algorithm workload retains the intended visual quality and responsive interaction on the documented reference setup.

### Phase 10 — Release and documentation

- [ ] Run targeted algorithm tests, workspace typechecks, app build and relevant shared-package regressions.
- [ ] Gate with a small public-UI E2E suite: guided loop, failure/recovery, recording round trip and reset during processing; reuse world projection for scene clicks.
- [ ] Keep fixture-based algorithm gates separate from tolerant GPU smoke checks; run longer lifecycle/performance checks locally or nightly.
- [ ] Document architecture, calibration, algorithm limits, synthetic versus pixel modes, Blender editing/export and measured performance.
- [ ] Add an app README, demo screenshots/GIF and root README usage commands once they actually exist.
- [ ] Prepare and publish the browser demo, checking asset/WASM paths, worker loading, browser capability messages and any required hosting headers.
- [ ] Complete a fresh-browser walkthrough proving image-based tracking, persistent mapping, verified loop closure and replay.

Exit: a documented, shareable visual SLAM demo with reproducible examples and a repeatable asset pipeline.

## Delivery order and completion criteria

Phases 0–3 establish feasibility, the visual foundation and trustworthy sensor input. Phase 4 delivers visual odometry; Phase 5 adds persistent mapping; Phase 6 is the first complete loop-closing SLAM slice. Phases 7–10 make it explorable, reproducible and ready to share. Blender detailing can continue alongside algorithm work once Phase 2 fixes scene scale, mounts and exports.

- [ ] Default release mode estimates motion from rendered stereo pixels without ground-truth leakage.
- [ ] The robot builds a persistent sparse map, recognizes a revisit geometrically and improves the estimate through optimization.
- [ ] Tracking loss, rejected matches and relocalization are honest and understandable.
- [ ] The authored lab and robot are visibly more sophisticated than the existing primitive-based scenes.
- [ ] Fixed input recordings reproduce estimator behavior within documented tolerances.
- [ ] Rendering and processing meet measured budgets with bounded memory.
- [ ] Existing applications retain their behavior after shared-package changes.

## Later extensions

- [ ] Monocular mode with explicit scale ambiguity and appropriate evaluation.
- [ ] IMU simulation and visual-inertial estimation.
- [ ] Dense stereo reconstruction and surface visualization.
- [ ] Real stereo dataset import and calibration tools.
- [ ] Dynamic objects and robust motion masking.
- [ ] ROS2 image/pose/map adapters and hardware recordings.

## Technical references

- [OpenCV camera calibration and 3D reconstruction](https://docs.opencv.org/4.x/d9/d0c/group__calib3d.html): reference for camera geometry, triangulation and pose estimation. Verify browser binding availability during Phase 0.
- [ORB-SLAM3 upstream](https://github.com/UZ-SLAMLab/ORB_SLAM3): architectural reference for visual SLAM. This plan does not assume a browser port or direct code reuse; review licensing before adopting code.
- [Blender MCP](https://blendermcp.org/): optional scene-authoring integration supplied by the user.
