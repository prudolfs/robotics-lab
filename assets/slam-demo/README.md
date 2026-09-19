# Inspection lab assets

Original Blender geometry and textures for SLAM Studio Phase 2, licensed under [ISC](LICENSE). No downloaded models, third-party textures or AI bitmap assets are used. The separately bundled Draco decoder is Apache-2.0, with its [license, attribution and hashes](../../apps/slam-demo/public/assets/slam/draco/NOTICE); Three.js is MIT.

- [inspection-lab.blend](inspection-lab.blend): editable, unmerged lab, enclosed-room walls, rover, wheel pivots, camera mounts and anchors. Texture images are packed.
- [workbench.blend](workbench.blend): isolated material/lighting gate, authored and reviewed in Chrome before extending the kit.
- [manifest.json](manifest.json): shared meter-scale geometry, collision rectangles, route, calibration, mounts and named anchors. Both the pure simulation and asset builder read this file.
- `textures/`: deterministic 256×256 UV tiles for albedo, roughness and tangent-space normal detail, baked from seeded numerical surface functions.

Run from the repository root with workspace dependencies and Blender 5.1.2 installed:

```sh
node scripts/slam-assets/prepare-runtime.mjs
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python scripts/slam-assets/build.py -- --sample
# With pnpm dev:slam running, review the isolated workbench in Chrome:
node scripts/slam-assets/review.mjs
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python scripts/slam-assets/build.py
node scripts/slam-assets/validate.mjs
pnpm build:slam
```

These commands run a separate Blender process and leave the user's open Blender/MCP session untouched. Rebuilding replaces the generated `.blend`, textures, GLBs and export reports. Keep manual Blender edits in a separate file and port accepted edits into `build.py` to preserve reproducibility. Blender MCP on port 9876 is optional, with no dependency in the browser application.

Coordinates in Blender/manifest are X forward, Y left, Z up. glTF/Three coordinates are `(x,z,-y)`, meters, with no import scaling. `Camera_Left` and `Camera_Right` are optical-center marker empties, **not glTF camera objects**; their `optical_to_robot` extra records right/down/forward axes. Wheel marker empties retain individual geometry children after optimization; animation rotates local scene −Z. Camera mounting height is 450 mm, baseline 120 mm, axle width 400 mm and nominal rolling radius 80 mm. Tread relief adds a few millimeters of decorative geometry. The rover's 310 mm circular collision radius conservatively encloses the body and wheels.

The workbench, island and shelf assemblies are positioned/scaled from manifest footprints. Export checks measure their mesh bounds (15 mm horizontal tolerance), including props. Heights in collision records describe base cabinets/shelves; taller workbench lamps, pegboards and island instruments remain within the horizontal footprint. The floor/wall kit is fixed to 10×8 m with explicit rejection of incompatible room dimensions; resizing requires reauthoring its modular bays and route. The collision solver remains planar and treats shelves as solid rectangles.

Editable mesh names and `asset_id` extras are stable for a fixed script. Runtime meshes merge by material and parent; `source_asset_ids` preserves original identifiers. Each collider is a named `Collision_*` empty with a serialized simplified rectangle, and spawn/route anchors are exported as named empties. `scene-manifest.json` accompanies the GLBs. SHA-256 checks reject stale exports.

The runtime uses 12 shared materials, two-segment bevels and 8–32-sided cylindrical details. Static meshes merge to 12 lab batches and 3 near-wall batches; rover parts remain separate by material and animated parent. Draco level 6 compresses geometry, and PNG compresses small tiled textures; no external decoder CDN is needed. These modest meshes need no distance-based LOD ladder yet. Low graphics disables shadows and fixes pixel ratio to 1; standard permits up to 1.5. Near walls appear only in Robot eye to preserve overview visibility.

See [Phase 2 browser review and measurements](../../docs/slam-demo/phase2/README.md).
