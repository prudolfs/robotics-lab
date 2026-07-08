// Test / automation bridge: the single source of truth for projecting between
// world and screen coordinates in E2E tests and agent automation.
//
// It is a *headless* R3F component — it renders nothing. Mounted inside the
// simulator's <Canvas>, it grabs the live Three.js camera + renderer through
// `useThree` and exposes a tiny read-only API on `window.__E2E__`:
//
//   window.__E2E__.worldToScreen({ x, y }) -> { x, y }   // CSS pixels, relative
//                                                       //   to the renderer canvas
//   window.__E2E__.screenToWorld({ x, y }) -> { x, y }  // inverse, via the
//                                                       //   floor intersection
//   window.__E2E__.canvasRect() -> { x, y, width, height } // live client rect
//
// Everything is delegated to the renderer's own matrices (Vector3.project /
// raycaster against the ground plane). There is no duplicate projection math
// anywhere else; the renderer is the single source of truth.
//
// The bridge never mutates simulation state — it only answers geometry
// questions. That keeps it safe to ship in production builds (it is the same
// API future agents and E2E tests drive through) and means the E2E suite can
// run against the real production preview build unchanged.

import { useThree } from '@react-three/fiber'
import type { Vec2 } from '@robotics-lab/geometry'
import { useEffect } from 'react'
import { Plane, Raycaster, Vector2, Vector3 } from 'three'
import { worldToScene } from './coords'

/** Shape of the read-only bridge exposed on `window.__E2E__`. */
export type E2EBridge = {
	/** Project a world point to canvas-relative CSS pixels. Returns null if the
	 *  point is behind the camera or otherwise unprojectable. */
	worldToScreen: (p: Vec2) => { x: number; y: number } | null
	/** Unproject a canvas-relative CSS pixel point back to a world point on the
	 *  floor plane (y = 0). Returns null if the ray does not hit the floor. */
	screenToWorld: (p: { x: number; y: number }) => Vec2 | null
	/** The renderer canvas client rect, measured lazily (resize-aware). */
	canvasRect: () => { x: number; y: number; width: number; height: number } | null
}

declare global {
	interface Window {
		__E2E__?: E2EBridge
	}
}

/** The infinite ground plane (y = 0 in scene space) used for unprojection. */
const GROUND = new Plane(new Vector3(0, 1, 0), 0)

/**
 * Headless bridge. Mount once inside the simulator <Canvas>. Captures the
 * live camera and renderer and installs `window.__E2E__`. Cleans up on unmount
 * so a hot-reloaded / remounted Canvas never leaves a stale API around.
 */
export function E2EBridge() {
	const camera = useThree((s) => s.camera)
	const gl = useThree((s) => s.gl)

	useEffect(() => {
		const api: E2EBridge = {
			canvasRect() {
				const r = gl.domElement.getBoundingClientRect()
				return { x: r.left, y: r.top, width: r.width, height: r.height }
			},
			worldToScreen(p) {
				const rect = gl.domElement.getBoundingClientRect()
				const [sx, , sz] = worldToScene(p, 0)
				const v = new Vector3(sx, 0, sz).project(camera)
				if (v.z > 1) return null // behind the camera / clipped by the far plane
				return {
					x: (v.x * 0.5 + 0.5) * rect.width,
					y: (-v.y * 0.5 + 0.5) * rect.height,
				}
			},
			screenToWorld(p) {
				const rect = gl.domElement.getBoundingClientRect()
				// Normalized device coordinates for the pointer.
				const ndc = new Vector2((p.x / rect.width) * 2 - 1, -(p.y / rect.height) * 2 + 1)
				const ray = new Raycaster()
				ray.setFromCamera(ndc, camera)
				const hit = new Vector3()
				if (!ray.ray.intersectPlane(GROUND, hit)) return null
				// scene (x, z) -> world (x, y) following the shared coordinate
				// convention in ./coords.
				return { x: hit.x, y: hit.z }
			},
		}
		// `camera` is a live reference from useThree, so the closures read the
		// current object directly even if makeDefault swaps the active camera.
		window.__E2E__ = api
		return () => {
			if (window.__E2E__ === api) window.__E2E__ = undefined
		}
	}, [camera, gl])

	return null
}
