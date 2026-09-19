# Phase 0 — feasibility and specification

Completed on 2026-09-19. This is an isolated feasibility spike, not the Phase 1 application. The eight Phase 0 tasks are supported below; later phases remain unimplemented.

Start review with the [visual specification](visual-reference.svg), [browser sample](browser-probe.png), and [measured results](measurements.json). Runnable sources live in [scripts/slam-phase0](../../../scripts/slam-phase0).

## Decisions

| Concern | Decision | Evidence / boundary |
| --- | --- | --- |
| Renderer | WebGL2 via Three.js/R3F initially | Stereo readback, pixel estimation, R3F mounting and EffectComposer bloom passed. WebGPU capture, R3F and TSL bloom also passed and are a viable later alternative; WebGPU pixel parity/estimation is not yet validated. |
| Vision | OpenCV.js 4.13.0 GFTT + pyramidal LK + RANSAC PnP, with TypeScript rectified stereo triangulation | Executed on actual rendered pixels inside a worker. Native `triangulatePoints` is absent in this specific build. The adapter uses `Z = fx × baseline / disparity`, covered by metric-depth tests. |
| Numerical reference | Small standalone TypeScript corner/patch matcher and robust pose refinement | Executed on the same pixels, in a module worker and via Node replay. Retain as an educational comparison, not as a claim of production tracking robustness. |
| Camera | Rectified, undistorted 640×480 stereo, 120 mm baseline, 10 Hz | Explicit intrinsics/extrinsics below; rendered image buffers are vertically corrected before processing. |
| World | Right-handed X forward, Y left, Z up; adapters preserve existing simulator appearance | Unit tests cover rigid adapter handedness, inverse mappings and stereo depth. Legacy planar Y and heading require sign changes. |
| Assets | Blender 5.1.2 → GLB, meter scale, glTF Y up | Three PBR samples exported in a separate process and loaded by GLTFLoader in the browser. |
| Authoring connection | Blender MCP responds on localhost:9876 | Read-only `get_scene_info` returned Scene with Cube, Light and Camera. No registered MCP tools were exposed; the local socket was verified directly after the user enabled it. |

No application dependencies or existing package APIs were changed. The downloaded OpenCV artifact and generated Blender files stay in `.temp`; sources, pinned download metadata, measurements and a compressed pixel fixture are retained in the repository.

## Guided loop storyboard

The authored lab is 10×8 m with a central 3×2 m equipment island. A closed route travels through a distinctive workbench area, a storage aisle and back to the charging dock. The route remains clear of the island and leaves room for the 0.48×0.38 m rover body.

| Beat | Visitor sees | Scientific event |
| --- | --- | --- |
| Before Run | Lit lab overview, parked robot, stereo feed and one obvious Run action | Initializing; no invented map points |
| First 2–5 seconds | Camera corners acquire tracks; first sparse points appear | Stereo initialization and first keyframe |
| Workbench pass | Textured tools/cabinets at several depths; useful camera feed remains visible | Tracking, triangulation and map growth |
| Storage aisle | More repeated surfaces; encoder trail gradually separates | Drift comparison; candidate rejection when evidence is insufficient |
| Dock revisit | Prior keyframe highlighted; connection appears only after verification | Appearance candidate → geometric verification → graph update |
| Completion | Before/after trajectory and compact error metrics | Corrected map, replay and optional explanation |

The route is a rounded rectangle with outer extents X ±3.5 m and Y ±2.5 m, corner radius 0.75 m, starting at `(0, -2.5)` heading +X. Its length is `2×(7+5) - 8×0.75 + 2π×0.75 = 22.712 m`. Cruise speed is 0.30 m/s; corner yaw rate is 0.40 rad/s. Travel takes 75.7 s at constant speed; allow approximately 80 s with starting/stopping ramps. Robot commands and sensor ticks use simulation time.

This complete route is a Phase 1+ specification. The feasibility recording is intentionally shorter: five stereo pairs over 0.4 s, moving 12 mm sideways and 20 mm forward per capture with 0.002 rad yaw increments. The independent sideways component excites the pose solver; it is a camera-rig test, not differential-drive kinematics.

## Visual specification

[Open the reference sheet](visual-reference.svg).

At a 1440×900 desktop viewport: 56 px top bar, 48 px timeline/status strip, roughly 300 px right inspector, and the remaining space for the scene. The processed camera image occupies an approximately 320×240 inset at the viewport edge; it can expand for feature inspection. Inspector sections are Tracking, Map and Events. On narrow screens the inspector collapses to a drawer; camera and transport controls remain reachable.

The reference sheet specifies a dark slate interface, painted teal rover, brushed alloy sensor bar, dark rubber wheels and a worn neutral floor. Use approximately 3500 K workbench lights and 6500 K ambient fill as art direction, then tune browser exposure with a neutral reference swatch. Add cabinet seams, cable trays, labels and asymmetric tools that are visible at the camera's 0.45 m height. Repeating patterns are confined to deliberate challenge areas.

Estimated trajectory is solid mint; encoder odometry is dashed amber; optional truth is dotted gray. Accepted landmarks use small points; rejected observations use crosses. Keyframe frusta stay subdued until selected. A closure event shows its verification evidence before any presentation animation. These styles communicate without color alone.

The Phase 0 browser screenshot is a numerical/material test scene, not finished lab artwork. Its random textured boxes deliberately provide trackable corners at multiple depths. The three spheres in front are the actual Blender-exported painted metal, alloy and rubber samples. Full lab/robot modeling belongs to Phase 2.

## Coordinate and timing contract

All distances are meters, angles radians and simulation timestamps seconds from run start. A sensor frame has a monotonic integer frame ID and timestamp `frameId / 10`. Both stereo exposures share the same timestamp and pose; presentation interpolation does not affect capture. Quaternion storage in future packages is `[x,y,z,w]`; rotations are active right-handed rotations.

`T_A_B` maps coordinates expressed in frame B into frame A: `p_A = R_A_B p_B + t_A_B`. Composition is `T_A_C = T_A_B T_B_C`. Matrices are described mathematically by rows; Three.js's storage layout must be handled at the adapter boundary rather than by copying flat arrays blindly. The spike's six-vector uses Rodrigues rotation followed by translation and maps reference optical-frame points into the current optical frame. It is not a world camera pose; invert it before displaying a camera center.

| Frame / mapping | Definition |
| --- | --- |
| Canonical world / robot | +X forward, +Y left, +Z up |
| Optical camera | +X right, +Y down, +Z forward |
| Optical → robot | `(x,y,z) → (z,-x,-y)`; determinant +1 |
| Canonical world → Three.js | `(x,y,z) → (x,z,-y)`; determinant +1 |
| Canonical world → Blender | Identity; author +Z up |
| Blender → exported glTF | `(x,y,z) → (x,z,-y)`; export Y-up exactly once |
| Existing planar simulator → canonical | `(x,y,height) → (x,-y,height)`; canonical yaw is `-legacyHeading` |
| Existing planar simulator → scene | Still `(x,height,y)`, preserving current `worldToScene` behavior |

The legacy planar embedding is a reflection, not an SE(3) rotation. Do not convert its matrix directly to a quaternion. Build the canonical pose using the explicit position mapping and yaw sign. `geometry.test.ts` verifies the rigid mappings have determinant +1 via basis cross products, all inverse round trips, and preservation of legacy scene placement.

### Calibration and mounting

```text
image: 640 × 480, RGBA8 capture → grayscale processing
K = [480   0 320]
    [  0 480 240]
    [  0   0   1]
distortion = [0,0,0,0]  (ideal rectified fixture)
baseline = 0.120 m
horizontal FOV = 67.38°; vertical FOV = 53.13°
near/far render clipping = 0.05 / 30 m
sensor period = 0.100 s
```

Rover sensor-bar midpoint in robot coordinates: `(0.160, 0, 0.450)`. Left optical center: `(0.160, +0.060, 0.450)`; right optical center: `(0.160, -0.060, 0.450)`. Both share the optical-to-robot rotation above, with no toe-in. `T_left_right` has identity rotation and translation `(+0.120,0,0)`; its inverse is used in the right projection matrix. Positive left-minus-right disparity implies positive depth.

For the spike only, the reference left camera is at the origin and the right camera is 0.12 m along its local right axis. The baseline rotates with the rig. This removes a robot-body transform from the numerical experiment while preserving the same calibrated stereo geometry. Ground-truth motion is retained in evaluator metadata, never passed into the processing workers.

## Measured feasibility

Reference host: Apple MacBook Pro Mac15,7, M3 Pro (12 CPU / 18 GPU cores), 18 GB RAM, macOS 26.5.1. Browser: locally installed Chrome 152, Playwright 1.61.1, headless mode at 1440×1000 for evidence capture. The future product viewport target remains 1440×900. WebGPU was probed with `--enable-unsafe-webgpu`; this is not a product requirement or a promise of support on other browsers.

Raw numbers and per-frame estimates are in [measurements.json](measurements.json). These are small-scene feasibility measurements, not a full-scene FPS benchmark.

| Measurement | TypeScript prototype | OpenCV hybrid |
| --- | --- | --- |
| Detected corners / accepted initial stereo points | 180 / 165 | 300 / 288 |
| Maximum translation-vector error, four estimates | 3.75 mm | 1.51 mm |
| Maximum Rodrigues-vector error | 0.00090 rad | 0.00035 rad |
| Pixel reprojection RMS | 0.410–0.561 px | Not separately measured in this spike |
| Initialization | About 10 ms | About 30 ms |
| Subsequent frame processing | About 6–8 ms | About 7–11 ms |
| Worker | Module worker | Classic worker loading UMD/WASM |
| Additional runtime download | Prototype frontend bundle: 5,699 bytes raw / 2,141 gzip; no vision binary | 10,964,323 bytes; 3,542,502 gzip bytes |
| WASM linear memory | None | 128 MiB allocated heap; not total process memory |

The implementations use different feature counts and matching methods, so these are practical feasibility comparisons, not an equal-work microbenchmark. OpenCV wins on subpixel accuracy and supplies robust PnP; the custom solver demonstrates the math but only handles a small local-motion window. Neither result establishes long-route stability, relocalization or loop closure.

The selected build exposes and executes `goodFeaturesToTrack`, `calcOpticalFlowPyrLK` and `solvePnPRansac`. `solvePnP`, `Rodrigues`, `ORB` and `BFMatcher` were also found as functions; ORB descriptor matching is not exercised here. `triangulatePoints` is **undefined**. The selected adapter executes tested TypeScript rectified triangulation instead. Do not advertise arbitrary unrectified triangulation until a later implementation supports it. The exact download URL, SHA-256 and sizes are retained in [opencv-build.json](opencv-build.json).

WebGL2 warm stereo capture/readback averaged about 11.2 ms per pair; WebGPU about 2.5 ms, excluding the first two of eight samples. Both produced image buffers, mounted in R3F and rendered bloom using their respective postprocessing APIs. WebGL2 was the source of the estimator fixture. The screenshot compares WebGL2 and WebGPU presentation, not left and right camera images. Renderer counters in the raw report are backend-specific diagnostics and are not comparable scene-complexity totals.

WebGL2 is the baseline because its complete pixel-to-estimate path is verified and its existing rendering/postprocessing stack fits the budget. If initialization fails, the product should show an actionable unsupported-graphics message and offer recorded results; it must not silently present a fabricated live run. Keep WebGPU behind an explicit later renderer option until pixel orientation/calibration, effects and recordings have equivalent coverage. Losing a graphics context should pause acquisition and offer reset.

### Benchmarks and budgets

For repeat measurements: use the same host/browser, power source and viewport; close competing GPU workloads; record browser/OS versions. Run three fresh sessions, report cold initialization separately, discard the first two capture pairs and retain per-frame timings. This checked-in report is one session, not a three-session statistical study. For later realistic scenes, extend the warm run to 60 seconds and report median/p95 alongside dropped frames.

| Stage | Initial engineering budget |
| --- | --- |
| Presentation | 16.7 ms/frame standard, 33.3 ms/frame low; measure later full scene at 1440×900 |
| Stereo render + readback + orientation conversion | 20 ms/pair at 10 Hz |
| Detection/tracking + stereo + PnP | 30 ms/pair; allow 50 ms on initialization |
| Local map update | 20 ms/pair, reserved for Phase 5 |
| Queue/transfer/publication | 10 ms/pair; one active pair plus one pending, timestamp every result |
| Margin in 100 ms sensor period | 20 ms after steady capture + vision + mapping + transfer |
| Optimization | Separate bounded worker jobs; do not block acquisition waiting for bundle adjustment |
| Input buffers | 2.344 MiB per RGBA stereo pair; at most two pairs in production queue |
| Vision memory | 128 MiB initial WASM heap; target under 256 MiB total vision-worker usage |
| Graphics memory | Provisional 256 MiB texture/target budget; full lab measurement deferred |
| Full scene/delivery | 500k visible triangles, 200 draw calls, 25 MB compressed initial payload |
| Map | 200 active keyframes / 20k active landmarks initially |

Performance budgets include the paired exposures, not one camera multiplied implicitly. Five retained pairs consume 11.719 MiB uncompressed in the recording. Benchmark code deliberately retains the whole short sequence; the production queue policy is a Phase 3 task. Browser total/GPU memory has not been measured; the known heap and explicit buffer sizes do not substitute for that measurement.

Numerical gates: coordinate round trips within `1e-10`, exact noiseless pose recovery within `1e-6`, fixed-pixel fixture translation-vector error below 10 mm, Rodrigues-vector error below 0.005 rad, TypeScript reprojection RMS below 1 px, and repeated same-runtime TypeScript replay producing identical pose arrays. Rotation-vector difference is a small-angle fixture diagnostic, not the final trajectory rotation metric. Later long-run evaluation should use relative rotation matrices and clearly defined alignment.

## Blender verification

Blender CLI reports 5.1.2, build `ec6e62d40fa9`. MCP at `127.0.0.1:9876` returned a successful scene query with the default Cube, Light and Camera. The open scene was not edited.

The fallback script [blender_probe.py](../../../scripts/slam-phase0/blender_probe.py) was actually run in a **separate** background process using `--factory-startup`. It creates three material samples, saves `.temp/slam-phase0/blender/material-probe.blend`, and exports `.temp/slam-phase0/blender/material-probe.glb`. The 199,404-byte GLB was loaded and rendered by the browser probe; [blender.json](blender.json) records the export result. Never execute this reset-style script inside the user's open scene.

For Phase 2, editable lab sources will live in `assets/slam-demo/`, with exported runtime files in `apps/slam-demo/public/`. Those production paths are specifications only. Meter scale, named camera mounts, wheel pivots and simplified collision geometry must be part of that export contract. Blender MCP is optional for authoring; the deployed browser app has no Blender connection.

## Reproduce and inspect

From the repository root, with the existing workspace dependencies installed:

```sh
# Download the exact tested OpenCV artifact; validates the committed SHA-256.
node scripts/slam-phase0/download-opencv.mjs

# Generate the isolated material sample without touching an open Blender scene.
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python scripts/slam-phase0/blender_probe.py

# Start the isolated browser probe, then open http://127.0.0.1:5180.
apps/simulator/node_modules/.bin/vite --config scripts/slam-phase0/vite.config.mjs

# In a second terminal, capture measurements and refresh the pixel recording.
node scripts/slam-phase0/run.mjs

# Verify coordinates and exact synthetic geometry; typecheck all spike TS.
node_modules/.bin/vitest run --config scripts/slam-phase0/vitest.config.mjs
node_modules/.bin/tsc -p scripts/slam-phase0/tsconfig.json

# Replay the committed pixels in Node, without Chrome, Blender or OpenCV.
node_modules/.bin/esbuild scripts/slam-phase0/src/frontend.ts \
  --bundle --format=esm --outfile=.temp/slam-phase0/frontend.mjs
node scripts/slam-phase0/replay.mjs
```

The recorder writes `measurements.json`, `browser-probe.png`, `fixture.json` and `stereo-fixture.rgba.gz` here. The fixture is five top-down RGBA8 pairs ordered frame-major, left then right; its SHA-256 covers uncompressed bytes. The procedural scene uses seed 42. Pixels may differ when regenerated on another GPU, so algorithm regression tests replay the committed bytes rather than assuming GPU determinism.

The spike is intentionally outside `apps/`: no Phase 1 UI/simulation scaffold, production worker lifecycle, map estimator or lab assets have been implemented. Its short-sequence workers are disposable experiments; production resource caps, tracking states, outlier scenarios and recovery remain explicit later-phase work.

## References

- [OpenCV.js tutorials](https://docs.opencv.org/4.x/d5/d10/tutorial_js_root.html) and [upstream JavaScript export configuration](https://github.com/opencv/opencv/blob/4.x/platforms/js/opencv_js.config.py): browser build context; actual capability decisions above come from the downloaded artifact.
- [OpenCV calibration and reconstruction](https://docs.opencv.org/4.x/d9/d0c/group__calib3d.html): camera projection and pose geometry.
- [Three.js documentation](https://threejs.org/docs/): renderer APIs. Compatibility was verified against the repository's installed Three.js 0.185.1 and R3F 9.6.1, including local renderer and BloomNode sources.
- [Blender MCP](https://blendermcp.org/): the user-supplied local authoring integration.
