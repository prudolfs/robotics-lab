# Shared robotics lab models

Authored in Blender through the local Blender MCP connection for Robot Simulator
and Drone Mission Planner. Slate, teal, ivory and mint materials match SLAM Studio
and Warehouse Demo. No external models or textures are required.

`lab-kit.blend` is the editable source library. The repeatable authoring script is
[`scripts/lab-assets/build.py`](../../scripts/lab-assets/build.py). Rebuild with
Blender MCP listening on port 9876:

```sh
python3 scripts/lab-assets/mcp.py
```

The builder creates a separate scene, restores the user's active scene, exports
GLBs and copies each asset into its consuming app's public directory. Meshes are
joined by material to limit draw calls. `manifest.json` records export sizes and
Blender-space bounds. Blender uses Z up; GLB exports use Y up and +X forward.

- Rover chassis: 0.4 × 0.28 m, with stereo camera and lidar housing. Wheels are
  independent so the configured wheelbase remains adjustable.
- Drone body: authored for a 0.13 m body radius. Existing parametric arms, motor
  positions and propeller animation still follow the simulation parameters.
- Crate and drum: centered unit envelopes, scaled to each existing world obstacle.

These assets affect rendering only. Map data, sensor calculations, physics,
navigation and mission behavior retain their existing definitions.
