# Robot Simulator

> A browser-first robotics simulator built with React, React Three Fiber and TypeScript.
>
> The goal is to learn robotics fundamentals by building a modular simulation platform that can later evolve into a robotics playground, integrate with ROS2 and eventually control real hardware.

---

# Goals

- Learn robotics concepts through implementation
- Build a professional GitHub portfolio project
- Create reusable packages for future robotics applications
- Keep the simulation deterministic and independent from React
- Build incrementally like a game prototype

---

# Non Goals

- Photorealistic graphics
- Physics realism comparable to Gazebo or Isaac Sim
- ROS integration in the first iterations
- AI / Machine Learning
- Full SLAM implementation
- Multi-robot simulation (initially)

---

# Tech Stack

## Package manager

- [x] Pnpm

## Frontend

- [x] React
- [x] TypeScript
- [x] Vite

## Rendering

- [x] Three.js
- [x] React Three Fiber
- [x] Drei

## State

- [x] Zustand (UI only)

## Testing

- [x] Vitest

---

# Architecture

```
apps/
    simulator/

packages/

    math/
    geometry/
    core/
    robot/
    sensors/
    occupancy-grid/
    navigation/
    rendering/
    ui/
    maps/
```

Simulation should remain framework independent.

React is only responsible for visualization and user interaction.

---

# Milestone 0 — Project Setup

## Repository

- [x] Create simulator application
- [x] Configure TypeScript
- [x] Configure Binome
- [x] Configure Vitest
- [x] Configure Vite

## Packages

- [x] Create core package
- [x] Create geometry package
- [x] Create robot package
- [x] Create rendering package
- [x] Create sensors package
- [x] Create occupancy-grid package
- [x] Create navigation package
- [x] Create maps package

## Rendering

- [x] React Three Fiber scene
- [x] Orbit controls
- [x] Camera
- [x] Lights
- [x] Infinite grid
- [x] FPS counter

---

# Milestone 1 — World

Goal:

Create a simple simulation environment.

## Tasks

- [x] World model
- [x] Floor
- [x] Walls
- [x] Boxes
- [x] Cylinders
- [x] Coordinate axes
- [x] Grid helper

## Maps

- [x] JSON map format
- [x] Map loader
- [x] Map serializer
- [x] Multiple maps

---

# Milestone 2 — Robot Core

Goal:

Build a differential drive robot.

## Robot State

- [ ] Pose
- [ ] Velocity
- [ ] Wheel speeds

## Kinematics

- [ ] Differential drive equations
- [ ] Forward motion
- [ ] Reverse motion
- [ ] Rotation
- [ ] Arc movement

## Rendering

- [ ] Robot body
- [ ] Wheels
- [ ] Heading indicator

## Debug

- [ ] Position overlay
- [ ] Velocity overlay
- [ ] Heading overlay

---

# Milestone 3 — Simulation Loop

Goal:

Separate rendering from simulation.

## Tasks

- [ ] Fixed timestep simulation
- [ ] Variable render rate
- [ ] Simulation clock
- [ ] Pause
- [ ] Resume
- [ ] Reset

---

# Milestone 4 — Teleoperation

Goal:

Drive the robot manually.

## Input

- [ ] Keyboard controls
- [ ] Speed adjustment
- [ ] Emergency stop

## UI

- [ ] HUD
- [ ] Control hints
- [ ] Robot status

---

# Milestone 5 — Sensors

Goal:

Introduce virtual sensors.

---

## Lidar

- [ ] Ray generation
- [ ] Raycasting
- [ ] Hit detection
- [ ] Distance measurements
- [ ] Configurable range
- [ ] Configurable resolution

### Visualization

- [ ] Laser rays
- [ ] Hit points
- [ ] Scan animation

---

## Camera

- [ ] Robot camera
- [ ] Render target
- [ ] Camera viewport
- [ ] Camera controls

---

# Milestone 6 — Occupancy Grid

Goal:

Build a map from lidar scans.

## Grid

- [ ] Grid representation
- [ ] Unknown cells
- [ ] Free cells
- [ ] Occupied cells

## Mapping

- [ ] Ray tracing
- [ ] Cell updates
- [ ] Probability updates
- [ ] Map reset

## Visualization

- [ ] 2D grid
- [ ] Minimap
- [ ] Live updates

---

# Milestone 7 — Navigation

Goal:

Drive to a target.

## Waypoints

- [ ] Click destination
- [ ] Goal marker
- [ ] Queue goals

## Controller

- [ ] Heading controller
- [ ] Distance controller
- [ ] Arrival detection

## Visualization

- [ ] Goal marker
- [ ] Planned trajectory

---

# Milestone 8 — Path Planning

Goal:

Navigate around obstacles.

## Algorithms

- [ ] A*
- [ ] Dijkstra (optional)

## Features

- [ ] Grid search
- [ ] Obstacle avoidance
- [ ] Path smoothing

## Visualization

- [ ] Open nodes
- [ ] Closed nodes
- [ ] Final path

---

# Milestone 9 — Coverage Planning

Goal:

Turn the robot into a robotic vacuum.

## Features

- [ ] Coverage algorithm
- [ ] Area completion
- [ ] Return to start
- [ ] Cleaning visualization

---

# Milestone 10 — Sensor Noise

Goal:

Make the simulator more realistic.

## Lidar

- [ ] Distance noise
- [ ] Random dropouts

## Motion

- [ ] Wheel slip
- [ ] Encoder drift

## Camera

- [ ] Image noise

---

# Milestone 11 — Localization

Goal:

Estimate robot pose.

## Features

- [ ] Dead reckoning
- [ ] Odometry visualization
- [ ] Pose history

---

# Milestone 12 — Editor

Goal:

Create an interactive world editor.

## World

- [ ] Add wall
- [ ] Remove wall
- [ ] Move obstacle
- [ ] Resize obstacle

## Robot

- [ ] Spawn robot
- [ ] Reset pose
- [ ] Duplicate robot (future)

---

# Milestone 13 — Playback

Goal:

Record and replay simulations.

## Recording

- [ ] Timeline
- [ ] Save run
- [ ] Load run
- [ ] Replay

---

# Milestone 14 — UI Polish

## HUD

- [ ] Robot inspector
- [ ] Sensor inspector
- [ ] Statistics
- [ ] Performance metrics

## Controls

- [ ] Debug toggles
- [ ] Visualization toggles
- [ ] Theme support

---

# Milestone 15 — Graphics Polish

Goal:

Improve presentation without changing architecture.

## Robot

- [ ] Better model
- [ ] Wheel animation
- [ ] Materials

## World

- [ ] Improved lighting
- [ ] Shadows
- [ ] Better floor
- [ ] Better obstacles

## Effects

- [ ] Smooth camera
- [ ] Better path rendering
- [ ] Better lidar rendering

---

# Future Extensions

## Robotics

- [ ] IMU
- [ ] GPS
- [ ] Ultrasonic sensors
- [ ] Multiple robots
- [ ] Ackermann steering
- [ ] Omnidirectional drive

## Algorithms

- [ ] RRT
- [ ] RRT*
- [ ] Pure Pursuit
- [ ] MPC
- [ ] Frontier exploration

## Computer Vision

- [ ] Feature detection
- [ ] Marker detection
- [ ] Stereo camera

## ROS2

- [ ] Topic bridge
- [ ] TF visualization
- [ ] LaserScan
- [ ] OccupancyGrid
- [ ] Odometry
- [ ] RViz interoperability

## Hardware

- [ ] Serial communication
- [ ] ESP32
- [ ] Raspberry Pi
- [ ] Real robot support

---

# Success Criteria

- [ ] Robot can be teleoperated
- [ ] Robot moves using differential drive kinematics
- [ ] Lidar correctly detects obstacles
- [ ] Occupancy grid updates in real time
- [ ] Robot camera functions correctly
- [ ] User can place navigation goals
- [ ] Robot autonomously reaches goals
- [ ] A* avoids obstacles
- [ ] Coverage planning works
- [ ] Simulation is deterministic
- [ ] Core simulation is framework independent
- [ ] Live demo is deployed
- [ ] Project is fully documented