# Phase 2 review — authored inspection environment

Phase 2 adds the Blender lab and articulated rover, UV-mapped PBR surfaces, studio reflections, warm task lighting, shadows, four inspection cameras, quality presets and explicit asset loading/failure states. The guided loop and odometry remain deterministic. **Stereo acquisition and visual SLAM remain inactive and belong to later phases.** Robot eye is a presentation view at the left optical mount, with a display-dependent aspect ratio; it is not a recorded 640×480 sensor frame.

Open [SLAM Studio](http://127.0.0.1:8082), run the inspection, switch Overview / Follow robot / Robot eye / Workbench, and compare Standard / Low graphics. Pause and reset should also stop/reset the wheel animation. Phase 3 has not been started.

## Visual review

The isolated [workbench material gate](workbench-gate.png) was reviewed in Chrome before expanding the kit. Its [render counters](workbench-gate.json) and [export report](sample-export.json) are retained. Full-scene review found and corrected shadow acne, mirrored east-facing labels and insufficient overlay contrast on light walls.

- [Overview](overview.png): open cutaway, clear loop around the equipment island, dock, bench and storage.
- [Workbench](workbench.png): drawer pulls/labels, pegboard tools, scope waveform, parts tray and task lamp.
- [Robot eye](robot-eye.png): enclosed-room sightlines from the actual left mount; storage is visible from the dock.
- [Follow](follow.png): custom rover chassis, stereo mast/lenses and wheel hubs/treads.
- [Moving inspection](running.png): route progress and encoder drift in the authored environment.
- [Low graphics](low.png) and [mobile](mobile.png): reduced shadow/pixel cost and responsive controls.

The near walls use a separate bundle, shown only from robot eye. There are no visual-SLAM features or map points invented for these screenshots.

## Sources and alignment

See [asset sources, licenses and rebuild commands](../../../assets/slam-demo/README.md). Both editable `.blend` files contain packed textures and the original unmerged modules. Exports are Draco-compressed GLB with embedded PNG textures. Twelve shared materials and material-based mesh merging keep batches small; wheel hierarchies remain articulated. Detail is bounded at authoring time; no distance-based LOD is claimed.

[manifest.json](../../../assets/slam-demo/manifest.json) is shared by the simulator and builder. Exported marker empties carry stereo basis, camera centers, wheel pivots, spawn/route anchors and collision rectangles. Measured module bounds verify horizontal footprint alignment, and the complete guided route passes collision tests. The [asset contract validator](../../../scripts/slam-assets/validate.mjs) checks actual GLB nodes, hashes, UVs, compression, identifiers, dimensions and calibration against that manifest.

## Validation

- 45 app/robot/noise unit tests pass, including loop completion, deterministic seeds, collision stalls, reset and wheel travel around inner/outer arcs.
- Five public-UI Playwright tests pass, including camera switching, graphics quality, moving/paused/reset wheels and blocked/failed asset loading.
- App typecheck, lint, production build and asset contract checks pass.
- Vite reports its usual large-bundle advisory for Three/R3F (about 337 kB gzipped application JS); delivery remains below the 25 MB budget.

Reproduce from the repository root:

```sh
node scripts/slam-assets/validate.mjs
pnpm -C apps/slam-demo lint
pnpm -C apps/slam-demo test
pnpm test:e2e:slam
pnpm build:slam
node scripts/slam-assets/delivery.mjs
pnpm -C apps/slam-demo preview --host 127.0.0.1 --port 4183 --strictPort
# In another terminal; uses locally installed Google Chrome:
SLAM_URL=http://127.0.0.1:4183 node scripts/slam-assets/capture.mjs
```

The capture script drives only public UI controls. `window.__slamRenderMetrics` exposes read-only diagnostic snapshots with no simulation setters. It records short static view samples, then a 65-second moving overview and retains up to 3,600 recent frame intervals. These are wall-clock animation intervals including UI/render work, not GPU timer queries. Capture includes the browser/OS/GPU identity, resource byte sizes, startup time, median/p95 and intervals exceeding 25 ms. Close competing GPU work when repeating; this is one local session, not a cross-device statistical guarantee.

## Measured budgets

Apple M3 Pro, Chrome 152.0.7977.83, macOS/Darwin darwin 25.5.0, ANGLE Metal; production preview, 1440×900, device pixel ratio 1, headless Chrome. [Raw browser measurements](browser-review.json), [asset export](asset-export.json), [whole-directory payload](delivery.json).

| Measurement | Result | Budget |
| --- | --- | --- |
| Moving standard overview | 16.7 ms median / 17.5 ms p95 | 16.7 ms target |
| Frames over 25 ms, retained moving sample | 0 / 3540 | Report stalls |
| Low overview | 16.7 ms median / 17.5 ms p95 | 33.3 ms |
| Moving standard render submissions | 131,486 triangles / 60 draws | 500k / 200 |
| Full lab + near walls + rover mesh geometry | 63,148 triangles | 500k |
| Production resources fetched | 1.58 MB | 25 MB |
| Entire build directory, including optional sample | 2.86 MB raw / 1.60 MB gzip estimate | 25 MB |
| Fresh-page asset readiness | 1326 ms | Recorded separately |
| Resident render objects after all views | 35 geometries / 11 textures | Recorded baseline |

Standard meets the approximately 60 FPS median goal; the 17.5 ms p95 is slightly above a strict 16.7 ms every-frame threshold. No interval in the retained moving sample exceeded 25 ms. Render submissions include the shadow pass, so they exceed the source triangle count. Low disables shadow rendering and uses 30 draws in the recorded static view. These numbers cover presentation and motion only, with no stereo capture or vision workload yet.

Graphics memory: source image tiles are 256×256; even a conservative eleven RGBA8 mip chains total under 4 MiB. The 256-resolution PMREM target adds about 6 MiB, the 2048² shadow color/depth pair about 32 MiB, and a conservatively estimated 4× MSAA color/depth display buffer at the 1.5 DPR cap about 74 MiB. This accounts for roughly 116 MiB of texture/target storage against the provisional 256 MiB budget, excluding driver overhead and transient allocations. **This is an allocation estimate, not a measured total GPU-memory value**; exact GPU process memory and full sensor/vision lifecycle profiling remain open for later phases. The measured resource counters above provide the Phase 2 baseline.

To refresh screenshots without replacing the retained benchmark, run `node scripts/slam-assets/capture.mjs --screenshots-only` against the dev app on port 8082. The checked-in screenshots include the final overlay contrast and follow-camera hint adjustments made after the recorded performance run.
