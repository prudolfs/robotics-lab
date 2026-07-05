// Occupancy grid visualization in the 3D scene.
//
// Renders the live occupancy grid as two flat layers of instanced quads
// sitting just above the ground plane:
//
//   free      -> translucent green quads (cells the lidar beam swept through)
//   occupied  -> opaque red quads (cells where the lidar endpoint landed)
//   unknown   -> not drawn
//
// Each layer is one InstancedMesh sized to a generous capacity so it is
// allocated once and reused across frames: we rewrite the per-instance
// matrices every render (the sim feeds a fresh grid each frame), so the map
// "fills in" live as the robot scans new territory without R3F having to tear
// down and rebuild the mesh. The component only observes the immutable
// `OccupancyGrid` produced by the deterministic mapping code in
// `@robotics-lab/occupancy-grid`; it owns no simulation state.

import type { OccupancyGrid } from '@robotics-lab/occupancy-grid'
import { classify } from '@robotics-lab/occupancy-grid'
import { useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'

/** Height of the occupancy layer above the ground plane (avoids z-fighting). */
const LAYER_ELEVATION = 0.03

/** Fraction of a cell the quad covers; <1 leaves a 1-cell gutter between
 *  cells so individual cells read distinctly at a glance. */
const CELL_INSET = 0.9

/** Upper bound on instances per layer. Sized for the default 200x200 grid. */
const MAX_INSTANCES = 200_000

const FREE_COLOR = 0x22c55e
const FREE_OPACITY = 0.25
const OCCUPIED_COLOR = 0xef4444
const OCCUPIED_OPACITY = 0.9

export type OccupancyGridViewProps = {
	grid: OccupancyGrid | null
}

/**
 * Render the occupancy grid as instanced quads on the floor. The buckets are
 * recomputed every render — the sim mutates the *same* `OccupancyGrid` in
 * place each fixed step (its object identity is stable), so memoizing on
 * `grid` would freeze the view at the first frame. We instead recompute the
 * cell lists each render (one pass over the cells array, cheap at the default
 * 200x200 grid) so the map "fills in" live as the robot scans new territory.
 */
export function OccupancyGridView({ grid }: OccupancyGridViewProps) {
	const buckets = bucketCells(grid)
	if (!grid || (buckets.free.length === 0 && buckets.occupied.length === 0)) return null

	return (
		<group position={[0, LAYER_ELEVATION, 0]} renderOrder={2}>
			<CellLayer
				cells={buckets.free}
				resolution={grid.resolution}
				color={FREE_COLOR}
				opacity={FREE_OPACITY}
			/>
			<CellLayer
				cells={buckets.occupied}
				resolution={grid.resolution}
				color={OCCUPIED_COLOR}
				opacity={OCCUPIED_OPACITY}
			/>
		</group>
	)
}

/** One coloured flat quad per cell in `cells`. Uses a single reused InstancedMesh. */
function CellLayer({
	cells,
	resolution,
	color,
	opacity,
}: {
	cells: CellQuad[]
	resolution: number
	color: THREE.ColorRepresentation
	opacity: number
}) {
	const meshRef = useRef<THREE.InstancedMesh>(null)
	const upAxis = useRef(new THREE.Vector3(1, 0, 0))
	const quat = useRef(new THREE.Quaternion())

	// Rotation that lays a +Z-facing plane flat on the xz ground plane.
	// The planeGeometry lives in its local xy; after rotating -90° about x, its
	// local +z (front normal) points up (+y) and its xy fills the world xz.
	useLayoutEffect(() => {
		quat.current.setFromAxisAngle(upAxis.current, -Math.PI / 2)
	}, [])

	// Rewrite matrices before R3F draws this frame. UseLayoutEffect runs after
	// the DOM/mesh is committed but before the browser paints the canvas, so the
	// instance positions are always correct on screen.
	useLayoutEffect(() => {
		const mesh = meshRef.current
		if (!mesh) return
		const q = quat.current
		const s = new THREE.Vector3(1, 1, 1)
		const p = new THREE.Vector3()
		const m = new THREE.Matrix4()
		const count = Math.min(cells.length, MAX_INSTANCES)
		for (let i = 0; i < count; i++) {
			const c = cells[i]
			// `c.x` / `c.y` are the world centre of the cell. The group already
			// lifts everything to LAYER_ELEVATION; here we only need the xz
			// position in the parent's local frame (= world xz, since the group
			// is at world origin and unrotated).
			p.set(c.x, 0, c.y)
			m.compose(p, q, s)
			mesh.setMatrixAt(i, m)
		}
		mesh.count = count
		mesh.instanceMatrix.needsUpdate = true
		mesh.computeBoundingSphere()
	}, [cells])

	if (cells.length === 0) return null

	return (
		<instancedMesh
			ref={meshRef}
			// Allocate once at the cap so changing cell counts never tears down
			// and rebuilds the mesh (which would reset instance matrices mid-frame).
			args={[undefined, undefined, MAX_INSTANCES]}
			frustumCulled={false}
		>
			<planeGeometry args={[resolution * CELL_INSET, resolution * CELL_INSET]} />
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

type CellQuad = {
	/** World-space x of the cell centre. */
	x: number
	/** World-space y of the cell centre. */
	y: number
	/** Cell side length in world units (= grid resolution). */
	size: number
	/** Pre-classified occupancy class. */
	cls: 'free' | 'occupied'
}

function bucketCells(grid: OccupancyGrid | null): { free: CellQuad[]; occupied: CellQuad[] } {
	const free: CellQuad[] = []
	const occupied: CellQuad[] = []
	if (!grid) return { free, occupied }
	const res = grid.resolution
	for (let i = 0; i < grid.cells.length; i++) {
		const cls = classify(grid.cells[i])
		if (cls === 'unknown') continue
		const col = i % grid.width
		const row = Math.floor(i / grid.width)
		const x = grid.origin.x + (col + 0.5) * res
		const y = grid.origin.y + (row + 0.5) * res
		const quad: CellQuad = { x, y, size: res, cls }
		if (cls === 'free') free.push(quad)
		else occupied.push(quad)
	}
	return { free, occupied }
}
