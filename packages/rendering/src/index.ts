// Reusable React Three Fiber components: scene, grid, lights and overlays.
//
// This package concentrates R3F rendering primitives so that applications
// stay thin. Only this package (and apps) depend on React and Three.js.

export { CoordinateAxes } from './axes'
export { SimulatorCamera } from './camera'
export { FpsCounter } from './fps-counter'
export { InfiniteGrid } from './grid'
export { Lights } from './lights'
export { SimulatorScene } from './scene'

export const RENDERING_PACKAGE_NAME = '@robotics-lab/rendering'
