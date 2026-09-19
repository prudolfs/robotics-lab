# @robotics-lab/vision

Framework-independent stereo visual odometry with an injected OpenCV.js facade. Inputs are calibrated, rectified grayscale RGBA images with monotonically increasing frame IDs and timestamps. No scene, truth, encoder or synthetic landmark inputs are accepted.

`createOdometry(cv, calibration)` owns bounded native image buffers. Call `process(left, right, frameId, timestamp)` sequentially and `dispose()` when done. Results use the first accepted left-camera optical frame (right/down/forward), with `T_origin_current` rotation and translation. Failed frames retain `acceptedFrameId` and the last accepted pose; `lost` requires a new instance/reset. Output overlays belong to the supplied frame.

The browser adapter vendors and verifies the Phase 0 OpenCV artifact. See the [Phase 4 review](../../docs/slam-demo/phase4/README.md) for gates, fixtures, measured drift, runtime limits and reproduction commands. Loop closure and global relocalization are not implemented.

Pass `{ mapping: true, scheduleBundle }` to enable the bounded local map. `scheduleBundle(job, done)` dispatches a job to an independent worker; if omitted, the same solver runs synchronously for deterministic fixtures. `MapSnapshot` carries the accepted pose and all retained geometry in one immutable revision. Deferred jobs are committed with the next accepted frame or rejected if their keyframe graph is stale. See [Phase 5](../../docs/slam-demo/phase5/README.md) for limits, stereo observations, robust bundle refinement, tests and measured costs.
