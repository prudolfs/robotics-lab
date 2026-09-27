# Phase 2 review — Predictable autonomous unloading

The [warehouse app](../../../apps/warehouse-demo/README.md) now unloads **every incoming pallet** without manual driving or task selection. The [overview](../../../apps/warehouse-demo/screenshots/phase2-overview.png) and [completed delivery](../../../apps/warehouse-demo/screenshots/phase2-complete.png) are browser captures of the WebGPU scene with placeholder geometry.

## Controller

The pure simulation modules are independent of React and Three. `selectTask` chooses accessible truck cargo in left-lane, near-before-rear order, breaking a remaining tie by cargo ID. It chooses the highest numbered empty bay. Occupancy is read from the current world after each placement, so pre-existing stock and delivered pallets both affect selection.

`buildRouteGraph` defines dock, pickup, truck exit, bay approach, rack clearance and dock turn poses, with a six-edge cycle. The motion controller drives each transfer with steering and speed feedback, brakes for pickup and placement, backs clear of the rack, turns toward the dock and repeats. Pickup and placement remain subject to the world model's fork alignment, height, reach and occupancy rules. If an alignment action is rejected, the controller backs off and retries twice; a third rejection pauses with a reason. The warehouse floor was extended from 12 × 12 m to **12 × 15.5 m** so the forklift can turn safely when servicing the far rack bays. The storage rack remains one short, single-level row of eight bays.

The inspector now shows the active cargo, destination, step and goal coordinates. A small floor cue joins the forklift to the current goal and can be hidden with the Route button. It is a current-goal cue, not a depiction of the full driven path.

## Verification

The six fixed reference seeds all completed with **zero contacts and zero invalid actions**:

| Seed | Incoming pallets | Simulated time |
| ---: | ---: | ---: |
| 3 | 4 | 293.8 s |
| 7 | 3 | 225.2 s |
| 42 | 4 | 267.4 s |
| 99 | 3 | 181.2 s |
| 2026 | 3 | 218.2 s |
| 4821 | 3 | 218.2 s |

The first 100 seeds also completed: 100/100 deliveries, zero contacts and zero invalid actions. Their simulated times ranged from **181.2 to 296.5 s**, averaging **249.5 s**. These are deterministic simulation results, not real-time browser durations or a claim about every possible seed. A separate test injects a small pickup offset and verifies recovery; another verifies the two-retry limit.

`pnpm -C apps/warehouse-demo lint`, `test`, `build` and `test:e2e` pass. The 16 standalone `test(...)` simulation cases cover the six reference seeds, 100 varied layouts, task tie breaks, route graph poses, alignment recovery and the Phase 1 world invariants. Two Chrome browser tests cover a full randomized delivery, controls, active WebGPU and the unavailable-WebGPU state. The browser run produced the linked screenshots and no page errors.

## Current boundary

The scene still uses placeholder meshes; Blender assets are Phase 3. Full Laya control and its observable failure behavior are Phase 4. The current route cue shows only the next goal, and the controller has been measured on the stated reference and varied seed sets.

**Stop here for user review before Phase 3.**
