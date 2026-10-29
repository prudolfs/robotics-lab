# Greenhouse authored kit

Original greenhouse and Pip caretaker authored with Blender 5.2.3 LTS. The editable assembly is [greenhouse.blend](greenhouse.blend), scene `Greenhouse_Phase3`. No third-party models or texture services are used. Browser users do not need Blender.

The [manifest](manifest.json) records metre dimensions, physical mounts, pivots and the Blender Z-up → Three.js Y-up mapping `(x, y, z) → (x, z, -y)`. Local +X is forward. The robot origin is the supported base origin; wheel origins are axle centers, the lift origin follows capsule center height, and capsule origin is its sphere center. Plant origins are at ground level. `Robot_Eye` is an inspection-camera mount under `Head_Pitch`.

From the repository root, with Blender open and Blender MCP listening on port 9876:

```sh
python3 scripts/greenhouse-assets/mcp.py
python3 scripts/greenhouse-assets/mcp.py --build
python3 scripts/greenhouse-assets/mcp.py --verify-source
node scripts/greenhouse-assets/validate.mjs
```

The [builder](../../scripts/greenhouse-assets/build.py) recreates only its tagged generated scene, exports six GLBs into `apps/greenhouse-demo/public/assets/greenhouse/`, writes the manifest and export report, then saves an isolated Blender scene library. It restores the original active scene and leaves unrelated objects intact. In Blender's scene selector, choose `Greenhouse_Phase3` to inspect the generated assembly. Rebuilding replaces edits to the generated scene and source file; preserve manual variants separately or incorporate changes into the builder.

The script also supports Blender background execution:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/greenhouse-assets/build.py
```

Meshes are batched by material and parent pivot. Named articulation nodes stay separate. GLBs embed all buffers and use PBR colors without texture downloads. The browser clones hierarchies, shares cached geometry/static materials, and owns/disposes only the animated status material. Transparent glass disables depth writes and shadow casting.

The physics remains the Phase 2 world. MuJoCo's chassis, wheel axes/radii/width, pot bounds, capsule radius, walls, lift limits and tray region are checked against the manifest by the server suite. Export validation checks actual wheel/pot/capsule bounds and articulation nodes. Decorative head/foliage have no additional collision geometry. Benches are wall mounted above 0.70 m, above the robot's 0.68 m visual envelope; pads are nearly flush. Wheel hub details extend at most 4 mm past the tyre collider and sill trim rises 2 mm above the wall to prevent coplanar surfaces. The tray remains a floor-level delivery region and charging remains decorative.

See the [Phase 3 review](../../docs/greenhouse-demo/phase3/README.md) for screenshots, performance, limitations and reproduction commands.
