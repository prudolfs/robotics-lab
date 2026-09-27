# Warehouse asset source

`warehouse.blend` is the editable Blender 5.1.2 source. Its `Warehouse_Phase3` scene contains the cutaway warehouse, truck, eight-bay rack, articulated forklift and two pallet variants. It was saved as an isolated scene library so unrelated scenes from the user's open Blender file are excluded. Blender can open it directly or append its scene.

`manifest.json` defines metres, coordinates, cargo slots, storage bays, vehicle dimensions, collision envelopes, asset URLs and articulation node names. The simulator imports this file; the exporter reads it and copies it beside the runtime GLBs. Blender uses Z up; exported glTF uses Y up, mapping simulation `(x, y)` to Three `(x, height, -y)`. The forklift points along local +X.

From the repository root, rebuild in the open Blender instance with MCP listening on 9876:

```sh
python3 scripts/warehouse-assets/mcp.py --build
```

The script creates its own scene, replaces only a previous generated warehouse scene, exports only that active scene, and leaves other Blender scenes intact. Rebuilding replaces authored edits in the generated scene and output files; preserve manual variants separately.

The same authoring script works in a separate background process:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python scripts/warehouse-assets/build.py
```

The four runtime GLBs are written to `apps/warehouse-demo/public/assets/warehouse`. Static meshes are joined by material and parent pivot, using standard PBR materials, embedded textures and low polygon bevels. The floor reuses the SLAM demo's packed floor texture. Named wheel, rear steering, mast and fork nodes remain separate. The saved source arranges the models for review; exported vehicle and pallet roots remain at the origin.

Validate exported scene isolation, embedded resources, pallet/vehicle bounds and all animation pivots:

```sh
node --test scripts/warehouse-assets/validate.test.mjs
```

For browser review, build the app, start `pnpm -C apps/warehouse-demo exec vite preview --host 127.0.0.1 --port 4184`, then run:

```sh
WAREHOUSE_URL=http://127.0.0.1:4184 node scripts/warehouse-assets/review.mjs
```

This captures overview, pickup, moving follow, lowering at the rack and shipment completion; it records local load time, frame intervals, backend, browser/device and resource sizes. The `--quick` option captures camera compositions without producing a performance report.
