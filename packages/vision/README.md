# @robotics-lab/vision

Framework-independent stereo visual odometry with an injected OpenCV.js facade. Inputs are calibrated, rectified grayscale RGBA images with monotonically increasing frame IDs and timestamps. No scene, truth, encoder or synthetic landmark inputs are accepted.

`createOdometry(cv, calibration)` owns bounded native image buffers. Call `process(left, right, frameId, timestamp)` sequentially and `dispose()` when done. Results use the first accepted left-camera optical frame (right/down/forward), with `T_origin_current` rotation and translation. Failed frames retain `acceptedFrameId` and the last accepted pose; `lost` requires a new instance/reset. Output overlays belong to the supplied frame.

The browser adapter vendors and verifies the Phase 0 OpenCV artifact. See the [Phase 4 review](../../docs/slam-demo/phase4/README.md) for gates, fixtures, measured drift, runtime limits and reproduction commands. Persistent mapping and loop closure are not implemented.
