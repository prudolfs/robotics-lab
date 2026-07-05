// Lidar visualization: renders the latest scan as laser rays from the robot
// pose to each hit point, plus a small marker at every hit.
//
// This component only observes the immutable `LidarScan` produced by the
// deterministic sensor model in `@robotics-lab/sensors`. It owns no simulation
// state — the React layer feeds it an updated scan every frame, so the rays
// "scan-animate" as the robot drives. Missing rays are drawn at the configured
// range so the FOV boundary is always visible.
//
// All geometry is built on the flat world->scene convention (`worldToScene`),
// with a small elevation so the rays hover just above the ground grid.

import type { LidarSample, LidarScan } from '@robotics-lab/sensors'
import { useMemo } from 'react'
import * as THREE from 'three'
import { worldToScene } from './coords'

const RAY_ELEVATION = 0.06
const HIT_RADIUS = 0.03

export type LidarViewProps = {
	scan: LidarScan | null
	/** Show laser rays. Defaults to true. */
	showRays?: boolean
	/** Show hit-point markers. Defaults to true. */
	showHits?: boolean
}

/**
 * Render the most recent lidar scan. Geometry is rebuilt each scan via `use`,
 * keyed on the scan's sample array length, so FOV/resolution changes are
 * reflected immediately while the per-frame vertex data is rewritten cheaply.
 */
export function LidarView({ scan, showRays = true, showHits = true }: LidarViewProps) {
	if (!scan) return null
	return (
		<group>
			{showRays && <Rays scan={scan} />}
			{showHits && <Hits scan={scan} />}
		</group>
	)
}

/** Laser rays from the sensor origin to each sample's endpoint. */
function Rays({ scan }: { scan: LidarScan }) {
	const positions = useMemo(() => buildRayPositions(scan), [scan])
	// Force a fresh geometry object whenever the vertex buffer identity changes
	// so R3F re-uploads it; alternation between scans hits the same pool.
	const geometry = useMemo(
		() =>
			new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3)),
		[positions],
	)
	return (
		<lineSegments geometry={geometry}>
			<lineBasicMaterial color="#38bdf8" transparent opacity={0.4} />
		</lineSegments>
	)
}

/** Hit-point markers, drawn as gold dots. */
function Hits({ scan }: { scan: LidarScan }) {
	const positions = useMemo(() => buildHitPositions(scan), [scan])
	const geometry = useMemo(
		() =>
			new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3)),
		[positions],
	)
	return (
		<points geometry={geometry}>
			<pointsMaterial color="#fbbf24" size={HIT_RADIUS * 4} sizeAttenuation />
		</points>
	)
}

/**
 * Line-segment vertex buffer for the rays: pairs of (origin, endpoint) per
 * sample. Endpoints are the hit point for hits and the ray's range extent for
 * misses so the FOV outline stays visible.
 */
function buildRayPositions(scan: LidarScan): Float32Array {
	const [ox, oy, oz] = worldToScene(scan.origin, RAY_ELEVATION)
	const positions = new Float32Array(scan.samples.length * 6)
	scan.samples.forEach((sample, idx) => {
		const base = idx * 6
		positions[base + 0] = ox
		positions[base + 1] = oy
		positions[base + 2] = oz
		const [ex, ey, ez] = worldToScene(rayEndpoint(scan, sample), RAY_ELEVATION)
		positions[base + 3] = ex
		positions[base + 4] = ey
		positions[base + 5] = ez
	})
	return positions
}

/** World-space endpoint of a sample (hit point, or range extent on a miss). */
function rayEndpoint(scan: LidarScan, sample: LidarSample) {
	const a = scan.origin.heading + sample.angle
	const r = sample.distance
	return { x: scan.origin.x + Math.cos(a) * r, y: scan.origin.y + Math.sin(a) * r }
}

/** Vertex buffer for hit points: one vertex per hit sample, in scene coords. */
function buildHitPositions(scan: LidarScan): Float32Array {
	const hits = scan.samples.filter((s) => s.hit !== null)
	const positions = new Float32Array(hits.length * 3)
	hits.forEach((s, idx) => {
		const a = scan.origin.heading + s.angle
		const world = {
			x: scan.origin.x + Math.cos(a) * s.distance,
			y: scan.origin.y + Math.sin(a) * s.distance,
		}
		const [x, y, z] = worldToScene(world, RAY_ELEVATION)
		const base = idx * 3
		positions[base + 0] = x
		positions[base + 1] = y
		positions[base + 2] = z
	})
	return positions
}
