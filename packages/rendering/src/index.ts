// Reusable React Three Fiber components: scene, grid, lights and overlays.
//
// This package concentrates R3F rendering primitives so that applications
// stay thin. Only this package (and apps) depend on React and Three.js.

export { CoordinateAxes } from './axes'
export { Boxes } from './boxes'
export { SimulatorCamera } from './camera'
export { type ScenePos, worldToScene } from './coords'
export { Cylinders } from './cylinders'
export { Floor } from './floor'
export { FpsCounter } from './fps-counter'
export { InfiniteGrid } from './grid'
export { LidarView } from './lidar-view'
export { Lights } from './lights'
export { OccupancyGridView } from './occupancy-grid-view'
export { OccupancyMinimap } from './occupancy-minimap'
export { RobotCameraViewport } from './robot-camera'
export { RobotView } from './robot-view'
export { SimulatorScene } from './scene'
export { Walls } from './walls'
export { WorldView } from './world-view'

export const RENDERING_PACKAGE_NAME = '@robotics-lab/rendering'
