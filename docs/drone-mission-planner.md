# Drone Mission Planner

> A browser-first drone mission planning tool built with React, React Three Fiber and TypeScript.
>
> The goal is to learn aerial robotics concepts by building a 3D mission planner that lets users design, simulate and visualize drone flight missions over custom environments.

---

# Goals

- Learn aerial robotics concepts through implementation
- Build a professional GitHub portfolio project
- Reuse packages from the robot simulator where possible
- Keep the simulation deterministic and independent from React
- Build incrementally like a game prototype
- Support exporting missions in a portable format (MAVLink / QGroundControl compatible)

---

# Non Goals

- Photorealistic graphics
- Realistic aerodynamics comparable to professional simulators
- Real-time flight control
- Multi-drone coordination (initially)
- Computer vision / obstacle avoidance in early iterations
- Hardware integration in early iterations

---

# Tech Stack

## Package manager

- [ ] Pnpm

## Frontend

- [ ] React
- [ ] TypeScript
- [ ] Vite

## Rendering

- [ ] Three.js
- [ ] React Three Fiber
- [ ] Drei

## State

- [ ] Zustand (UI only)

## Testing

- [ ] Vitest

---

# Architecture

```
apps/
    drone-mission-planner/

packages/ (reused from simulator where possible)

    math/
    geometry/
    core/
    rendering/
    ui/
    maps/
    navigation/
    drone/        (new — drone dynamics + mission logic)
```

Mission logic and drone physics should remain framework independent.

React is only responsible for visualization and user interaction.

---

# Milestone 0 — Project Setup

Goal:

Bootstrap the drone mission planner application.

## Application

- [x] Create drone-mission-planner app
- [x] Configure Vite
- [x] Configure TypeScript
- [x] Configure Biome
- [x] Configure Vitest
- [x] Reuse core, math, geometry and rendering packages; configure app-local shadcn/ui

## Rendering

- [x] React Three Fiber scene
- [x] Orbit controls
- [x] Camera
- [x] Lights
- [x] Infinite grid
- [x] Sky / horizon

## Shell

- [x] Top bar (mission name, save, load)
- [x] Side panel (mission settings)
- [x] Bottom bar (telemetry / status)
- [x] Theme support

---

# Milestone 1 — World

Goal:

Reuse the simulator world representation and render it in 3D.

## Tasks

- [x] Import map loader from simulator
- [x] Floor
- [x] Walls
- [x] Boxes
- [x] Cylinders
- [x] Coordinate axes
- [x] Grid helper
- [x] World scale configuration

---

# Milestone 2 — Drone Model

Goal:

Define a quadcopter drone model.

## State

- [x] 3D position
- [x] Orientation (quaternion / euler)
- [x] Velocity
- [x] Battery level
- [x] Mission state (idle, armed, flying, landed)

## Kinematics

- [x] 4 rotor layout
- [x] Motor speed state
- [x] Thrust vector
- [x] Torque vector
- [x] Hover throttle

## Rendering

- [x] Drone body
- [x] Arms
- [x] Propellers
- [x] Heading indicator
- [x] Spin animation

---

# Milestone 3 — Simulation Loop

Goal:

Separate rendering from simulation.

## Tasks

- [x] Fixed timestep simulation
- [x] Variable render rate
- [x] Simulation clock
- [x] Pause
- [x] Resume
- [x] Reset
- [x] Time scaling (slow motion, fast forward)

---

# Milestone 4 — Simple Physics

Goal:

Implement a lightweight physics model for the drone.

## Forces

- [x] Gravity
- [x] Thrust
- [x] Drag
- [x] Ground reaction

## Integration

- [x] Semi-implicit Euler
- [x] Velocity update
- [x] Position update

## Attitude

- [x] Yaw dynamics
- [x] Pitch / roll approximation (initially simplified)

---

# Milestone 5 — Manual Control

Goal:

Fly the drone manually.

## Input

- [x] Keyboard controls (throttle, yaw, pitch, roll)
- [x] Joystick / gamepad support
- [x] Speed adjustment
- [x] Emergency stop / kill switch
- [x] Arm / disarm

## UI

- [x] HUD
- [x] Control hints
- [x] Drone status
- [x] Battery indicator

---

# Milestone 6 — Camera Modes

Goal:

Provide intuitive camera views.

## Modes

- [x] Free orbit camera
- [x] Follow camera
- [x] Chase camera
- [x] First-person view (FPV)
- [x] Cinematic camera

## Smoothness

- [x] Camera damping
- [x] Smooth look-at
- [x] FOV adjustment

---

# Milestone 7 — Sensors

Goal:

Add virtual sensors to the drone.

---

## Lidar

- [x] 360° lidar
- [x] Raycasting
- [x] Distance measurements
- [x] Configurable range
- [x] Configurable resolution

### Visualization

- [x] Laser rays
- [x] Hit points

---

## Altimeter

- [x] Ground height sampling
- [x] AGL altitude output

---

## GPS

- [x] Global position output
- [x] Configurable noise
- [x] Waypoint distance

---

## IMU

- [x] Acceleration
- [x] Angular velocity
- [x] Heading

---

# Milestone 8 — Mission Editor

Goal:

Allow the user to design flight missions.

## Mission Items

- [x] Takeoff
- [x] Land
- [x] Waypoint (position)
- [x] Waypoint (position + altitude)
- [x] Return to launch (RTL)
- [x] Hold / loiter
- [x] Speed change
- [x] Camera trigger (future)

## Editor UI

- [x] Mission list panel
- [x] Drag to reorder
- [x] Edit altitude / speed
- [x] Delete item
- [x] Insert above / below

## Editing

- [x] Click on map to add waypoint
- [x] Click and drag to move waypoint
- [x] Snap to altitude
- [x] Undo / redo

---

# Milestone 9 — Mission Execution

Goal:

Execute the mission in the simulator.

## State Machine

- [ ] Idle
- [ ] Armed
- [ ] Taking off
- [ ] Flying
- [ ] Holding
- [ ] Landing
- [ ] Disarmed

## Transitions

- [ ] Arm command
- [ ] Auto takeoff
- [ ] Auto land
- [ ] RTL
- [ ] Mission start / pause / resume
- [ ] Emergency stop

## Trajectory

- [ ] Smooth path between waypoints
- [ ] Arrival detection
- [ ] Yaw alignment with heading
- [ ] Mission completion detection

## Visualization

- [ ] Planned path
- [ ] Current target
- [ ] Mission progress
- [ ] Mission timeline

---

# Milestone 10 — Mission Validation

Goal:

Prevent unsafe or impossible missions.

## Checks

- [ ] Takeoff altitude reachable
- [ ] Waypoint order valid
- [ ] Altitude bounds
- [ ] Speed bounds
- [ ] Distance bounds
- [ ] Battery feasibility estimate
- [ ] Collision check vs map

## UI

- [ ] Validation panel
- [ ] Warnings
- [ ] Errors
- [ ] Highlight invalid items

---

# Milestone 11 — Mission Persistence

Goal:

Save and load missions.

## Format

- [ ] JSON mission format
- [ ] Schema versioning
- [ ] Version migration

## Storage

- [ ] Save to file
- [ ] Load from file
- [ ] Local storage of recent missions

## Examples

- [ ] Sample mission 1 — simple waypoint tour
- [ ] Sample mission 2 — survey grid
- [ ] Sample mission 3 — inspection loop

---

# Milestone 12 — Export / Import

Goal:

Integrate with external mission tools.

## QGroundControl

- [ ] Export to .plan format
- [ ] Import from .plan format
- [ ] Mission item mapping

## MAVLink

- [ ] Export mission items in MAVLink format
- [ ] Round-trip validation

---

# Milestone 13 — Telemetry

Goal:

Display live flight telemetry.

## HUD

- [ ] Altitude
- [ ] Ground speed
- [ ] Vertical speed
- [ ] Heading
- [ ] Battery
- [ ] Distance to next waypoint
- [ ] Mission progress

## Charts

- [ ] Altitude vs time
- [ ] Speed vs time
- [ ] Battery vs time

---

# Milestone 14 — Mission Replay

Goal:

Record and replay drone missions.

## Recording

- [ ] Record full mission run
- [ ] Save recording
- [ ] Load recording

## Playback

- [ ] Scrub timeline
- [ ] Play / pause
- [ ] Speed control
- [ ] Camera playback

---

# Milestone 15 — UI Polish

Goal:

Improve the editor and viewer experience.

## Panels

- [ ] Mission inspector
- [ ] Sensor inspector
- [ ] Drone inspector
- [ ] Statistics
- [ ] Performance metrics

## Controls

- [ ] Keyboard shortcuts
- [ ] Visualization toggles
- [ ] Theme support
- [ ] Layout presets

---

# Milestone 16 — Graphics Polish

Goal:

Improve presentation without changing architecture.

## Drone

- [ ] Better drone model
- [ ] Propeller animation
- [ ] Materials

## World

- [ ] Improved lighting
- [ ] Shadows
- [ ] Better floor
- [ ] Better obstacles

## Sky

- [ ] Skybox
- [ ] Sun position
- [ ] Time of day

## Effects

- [ ] Smooth camera
- [ ] Better path rendering
- [ ] Better lidar rendering
- [ ] Mission path arrows

---

# Future Extensions

## Aerial Robotics

- [ ] Waypoint actions (camera trigger, payload drop)
- [ ] Survey / coverage missions
- [ ] Corridor planning
- [ ] Dynamic obstacles
- [ ] Wind fields
- [ ] Battery model
- [ ] Failure modes (motor failure, GPS loss)
- [ ] Fixed-wing drone support

## Algorithms

- [ ] A* in 3D
- [ ] RRT* in 3D
- [ ] Minimum snap trajectory optimization
- [ ] Polynomial path smoothing
- [ ] Velocity obstacle avoidance

## Computer Vision

- [ ] Downward camera
- [ ] Object detection
- [ ] Marker landing
- [ ] Stereo vision

## ROS2

- [ ] Topic bridge
- [ ] TF visualization
- [ ] Path / Trajectory messages
- [ ] RViz interoperability

## Hardware

- [ ] PX4 support
- [ ] ArduPilot support
- [ ] MAVLink communication
- [ ] SITL integration
- [ ] Real drone control

---

# Success Criteria

- [ ] Drone can be teleoperated manually
- [ ] Drone flies with a simplified physics model
- [ ] Sensors (lidar, GPS, altimeter, IMU) work
- [ ] User can build a mission with waypoints
- [ ] Drone executes the mission autonomously
- [ ] Mission can be paused and resumed
- [ ] Mission validation catches unsafe inputs
- [ ] Missions can be saved and loaded
- [ ] Missions can be exported to QGroundControl format
- [ ] Telemetry HUD displays live data
- [ ] Missions can be recorded and replayed
- [ ] Core simulation is framework independent
- [ ] Live demo is deployed
- [ ] Project is fully documented
