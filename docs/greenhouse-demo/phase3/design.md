# Phase 3 visual brief

The 3D greenhouse is the focus. Keep the existing slate/fern interface and Geist typography; this phase authors the world and caretaker rather than redesigning the course UI.

Pip is an original small greenhouse caretaker: warm ivory panels, a rounded shoulder line, dark rubber wheels, binocular lenses, a slender swiveling neck and an exposed linear lift with simple padded jaws. A seed-shaped chest badge and amber latches connect its appearance to its job. Preserve the existing chassis, wheel, capsule and pickup dimensions. Head glances, a brief nod on pickup/delivery and status lighting are authored responses to real events, not learned actions.

Use fern framing `#536c60`, warm ivory `#e6ddbc`, graphite `#283a35`, muted leaf green `#7d9a69`, seed amber `#c99643` and light limestone `#c9c6ae`. Dark eye glass and small warm highlights give the face contrast; avoid making the scene uniformly pale green.

The greenhouse has a cutaway near/east side, a complete far/west frame, translucent rear glazing and a partial roof. Warm light falls across bevelled pavers and purposefully detailed plants. The route stays visible from the existing overview. The robot-eye mode is an inspection view and does not become a vision sensor in this phase.

```
          rear wall / translucent glazing
       floating potting benches and seed trays
         ground pots with authored plants

       open collection route        destination

  wall-mounted charging panel / flat pad
          near side cut away for overview
```

Potting benches are wall mounted with all underside/support geometry above 0.70 m. Pip's visual height is below 0.68 m and its carried capsule stays below 0.33 m, so these do not add a ground obstacle to the Phase 2 world. The charger panel sits inside the existing west-wall collider; its pad and the destination mat are nearly flat. Preserve collision behavior and validate exported geometry against the shared manifest and Python model.

Export a static environment, an articulated caretaker, a collectible capsule and three plant variants. Batch by material and parent pivot; retain named wheel, head, eyelid, lift, jaw, eye-camera and status nodes. Use standard glTF PBR materials; translucent panels disable depth writes in the browser. No external model downloads or raster generation are needed.

The source is an isolated Blender scene saved into `assets/greenhouse-demo/greenhouse.blend`. The generator replaces only its own generated scene, restores the user's original active scene, and leaves unrelated Blender objects intact. Runtime exports belong under the greenhouse app's public assets folder. Review browser overview, follow, robot-eye, pickup and delivery images before accepting the visual result.
