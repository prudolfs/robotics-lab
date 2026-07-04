// 2D world space <-> 3D scene mapping.
//
// The simulation lives in a flat 2D world (x, y). The scene renders onto the
// Three.js ground plane (x, z) with y pointing up, which matches Drei's Grid
// and the default three camera orientation.
//
//   world.x -> scene.x
//   world.y -> scene.z   (depth on the floor)
//   world up -> scene.y
//
// Centralising this means every renderer agrees on the convention.

import type { Vec2 } from '@robotics-lab/geometry'

export type ScenePos = [x: number, y: number, z: number]

/** Map a 2D world point to a 3D position on the ground plane. */
export function worldToScene(p: Vec2, height = 0): ScenePos {
	return [p.x, height, p.y]
}
