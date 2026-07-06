// Path planning visualization (milestone 8).
//
// Renders the artefacts of an A* / Dijkstra grid search that the loop planner
// produced:
//
//   - open cell dots   : cells ever queued to the frontier (translucent amber)
//   - closed cell dots  : cells expanded into the closed set (translucent red)
//   - final path line   : the smoothed world-space route the robot is following
//
// As with the other overlays, the component only *observes* the immutable
// planner artifacts from the store — it owns no simulation state. The store /
// `App` feed a fresh snapshot each render so the open / closed fields "fill
// in" live as the planner replans on the enriching occupancy grid, and the
// path line retreats as the controller consumes waypoints.
//
// The dots are drawn with two `InstancedMesh`es (one per bucket) sized the
// same way as the occupancy-grid view: allocated once at a generous capacity
// and rewritten each render, so changing cell sets never tears down the
// geometry. The path line is a `lineSegments` (same trick `GoalView` uses to
// dodge the JSX `<line>` / SVG `line` collision in TypeScript).

import type { Goal } from '@robotics-lab/navigation'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { type ScenePos, worldToScene } from './coords'

/** Elevation of the path overlay above the floor (avoids z-fighting with the
 *  occupancy grid and goal markers; sits just above the grid layer). */
const LAYER_ELEVATION = 0.05
/** World-size of one search-node dot (a small flat circle on the floor). */
const DOT_RADIUS = 0.06
/** Generous capacity so changing grids never reallocates the instanced meshes. */
const MAX_INSTANCES = 200_000

const OPEN_COLOR = 0xfbbf24 // amber — frontier cells
const OPEN_OPACITY = 0.45
const CLOSED_COLOR = 0xf97316 // orange — expanded cells
const CLOSED_OPACITY = 0.4
const PATH_COLOR = 0xa78bfa // violet — the smoothed route
const PATH_OPACITY = 0.95

export type PathViewProps = {
	/** Cells expanded into the closed set (world centres) — `null` draws none. */
	closed: { x: number; y: number }[] | null
	/** Cells ever queued to the open frontier (world centres). */
	open: { x: number; y: number }[] | null
	/** Smoothed world-space waypoints the controller is following. */
	path: Goal[] | null
	/** Robot pose — the path line starts at the robot, not its cell center. */
	pose?: { x: number; y: number; heading: number } | null
}

/**
 * Render the planner's open / closed cell dots and the final path polyline.
 * Returns `null` when there is nothing to draw so `App` can mount it
 * unconditionally.
 */
export function PathView({ closed, open, path, pose }: PathViewProps) {
	const hasClosed = (closed?.length ?? 0) > 0
	const hasOpen = (open?.length ?? 0) > 0
	const hasPath = (path?.length ?? 0) > 0
	if (!hasClosed && !hasOpen && !hasPath) return null
	return (
		<group position={[0, LAYER_ELEVATION, 0]} renderOrder={4}>
			{closed && closed.length > 0 && (
				<NodeDots points={closed} color={CLOSED_COLOR} opacity={CLOSED_OPACITY} />
			)}
			{open && open.length > 0 && (
				<NodeDots points={open} color={OPEN_COLOR} opacity={OPEN_OPACITY} />
			)}
			{path && path.length > 0 && <PathLine path={path} pose={pose ?? null} />}
		</group>
	)
}

/** One flat circular dot per planner node, instanced for performance. */
function NodeDots({
	points,
	color,
	opacity,
}: {
	points: { x: number; y: number }[]
	color: THREE.ColorRepresentation
	opacity: number
}) {
	const meshRef = useRef<THREE.InstancedMesh>(null)
	const upAxis = useRef(new THREE.Vector3(1, 0, 0))
	const quat = useRef(new THREE.Quaternion())
	useLayoutEffect(() => {
		quat.current.setFromAxisAngle(upAxis.current, -Math.PI / 2)
	}, [])
	useLayoutEffect(() => {
		const mesh = meshRef.current
		if (!mesh) return
		const q = quat.current
		const s = new THREE.Vector3(1, 1, 1)
		const p = new THREE.Vector3()
		const m = new THREE.Matrix4()
		const count = Math.min(points.length, MAX_INSTANCES)
		for (let i = 0; i < count; i++) {
			const pt = points[i]
			p.set(pt.x, 0, pt.y)
			m.compose(p, q, s)
			mesh.setMatrixAt(i, m)
		}
		mesh.count = count
		mesh.instanceMatrix.needsUpdate = true
		mesh.computeBoundingSphere()
	}, [points])
	return (
		<instancedMesh ref={meshRef} args={[undefined, undefined, MAX_INSTANCES]} frustumCulled={false}>
			<circleGeometry args={[DOT_RADIUS, 8]} />
			<meshBasicMaterial
				color={color}
				transparent
				opacity={opacity}
				side={THREE.DoubleSide}
				depthWrite={false}
			/>
		</instancedMesh>
	)
}

/**
 * Polyline from the robot (if provided) through the planned waypoints, drawn
 * as `lineSegments` of consecutive vertex pairs — the same approach `GoalView`
 * uses to avoid the R3F `<line>` / SVG `<line>` JSX collision.
 */
function PathLine({
	path,
	pose,
}: {
	path: { x: number; y: number }[]
	pose: { x: number; y: number; heading: number } | null
}) {
	const positions = useMemo(() => buildSegmentPositions(path, pose), [path, pose])
	const geometry = useMemo(
		() =>
			new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3)),
		[positions],
	)
	if (positions.length === 0) return null
	return (
		<lineSegments geometry={geometry}>
			<lineBasicMaterial color={PATH_COLOR} transparent opacity={PATH_OPACITY} />
		</lineSegments>
	)
}

/** Segment-pair vertex buffer for the path: [p0,p1, p1,p2, ...]. Pairs rather
 *  than a connected strip because `lineSegments` reads 2 vertices per line. */
function buildSegmentPositions(
	path: { x: number; y: number }[],
	pose: { x: number; y: number; heading: number } | null,
): Float32Array {
	const pts: ScenePos[] = []
	if (pose) pts.push(worldToScene(pose, LAYER_ELEVATION))
	for (const p of path) pts.push(worldToScene(p, LAYER_ELEVATION))
	if (pts.length < 2) return new Float32Array(0)
	const segCount = pts.length - 1
	const out = new Float32Array(segCount * 2 * 3)
	let write = 0
	for (let i = 0; i < segCount; i++) {
		const a = pts[i]
		const b = pts[i + 1]
		out[write++] = a[0]
		out[write++] = a[1]
		out[write++] = a[2]
		out[write++] = b[0]
		out[write++] = b[1]
		out[write++] = b[2]
	}
	return out
}
