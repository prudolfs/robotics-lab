// Localization visualization (milestone 11): renders the dead-reckoning
// odometry estimate as a fading trail plus a marker at the estimated pose.
//
// The component only *observes* the immutable odometry snapshot the store
// feeds it — it owns no simulation state. The estimate is computed in the
// simulation loop by integrating the *commanded* wheel speeds (the encoders'
// view, before motion noise) so the trail diverges from the robot's actual
// pose once wheel slip / encoder drift are enabled (milestone 10). Drawing
// it on the scene makes that divergence immediately legible.
//
// Conventions:
//   - the trail is a flat polyline at a small elevation above the floor
//     (lineSegments of consecutive history pairs, same trick `GoalView` /
//     `PathView` use to dodge the R3F `<line>` / SVG `<line>` clash)
//   - the estimate marker is a cyan ring + heading bar, visually distinct
//     from the green ground-truth robot and the amber trajectory line

import type { Pose } from '@robotics-lab/core'
import { useMemo } from 'react'
import * as THREE from 'three'
import { worldToScene } from './coords'

/** Elevation of the trail / marker over the ground plane. */
const LAYER_ELEVATION = 0.06
const TRAIL_COLOR = 0x22d3ee // cyan — dead-reckoned path
const TRAIL_OPACITY = 0.85
const MARKER_RADIUS = 0.14
const MARKER_TUBE = 0.025
const MARKER_COLOR = 0x22d3ee
const HEADING_LENGTH = 0.16
const HEADING_COLOR = 0x0891b2

export type OdometryViewProps = {
	/** Recent estimated poses (oldest first) traced as a trail. */
	history: Pose[]
	/** The current dead-reckoned pose; rendered as a marker + heading. */
	pose: Pose | null
}

/**
 * Render the dead-reckoning trail and estimate marker. Returns `null` when
 * there is nothing to draw so `App` can mount it unconditionally.
 */
export function OdometryView({ history, pose }: OdometryViewProps) {
	const hasTrail = history.length >= 2
	const hasMarker = pose !== null
	if (!hasTrail && !hasMarker) return null
	return (
		<group position={[0, LAYER_ELEVATION, 0]} renderOrder={5}>
			{hasTrail && <Trail history={history} />}
			{hasMarker && pose && <EstimateMarker pose={pose} />}
		</group>
	)
}

/** Polyline through the recorded estimate poses, drawn as `lineSegments` of
 *  consecutive vertex pairs (pairs because `lineSegments` reads 2 vertices
 *  per line, and to avoid the R3F `<line>` / SVG `line` JSX collision). */
function Trail({ history }: { history: Pose[] }) {
	const positions = useMemo(() => buildTrailPositions(history), [history])
	const geometry = useMemo(
		() =>
			new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3)),
		[positions],
	)
	if (positions.length === 0) return null
	return (
		<lineSegments geometry={geometry}>
			<lineBasicMaterial color={TRAIL_COLOR} transparent opacity={TRAIL_OPACITY} />
		</lineSegments>
	)
}

/** A flat cyan ring at the estimated pose plus a heading bar — visually
 *  distinct from the green ground-truth robot body. */
function EstimateMarker({ pose }: { pose: Pose }) {
	const [x, , z] = worldToScene(pose, 0)
	const yaw = -pose.heading // world heading → scene y rotation (matches RobotView)
	return (
		<group position={[x, 0, z]} rotation={[0, yaw, 0]}>
			<mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
				<torusGeometry args={[MARKER_RADIUS, MARKER_TUBE, 12, 32]} />
				<meshBasicMaterial color={MARKER_COLOR} transparent opacity={0.9} depthWrite={false} />
			</mesh>
			<mesh position={[MARKER_RADIUS / 2 + HEADING_LENGTH / 2, 0, 0]}>
				<boxGeometry args={[HEADING_LENGTH, 0.02, 0.03]} />
				<meshBasicMaterial color={HEADING_COLOR} transparent opacity={0.95} depthWrite={false} />
			</mesh>
		</group>
	)
}

/** Segment-pair vertex buffer for the trail: [p0,p1, p1,p2, ...]. */
function buildTrailPositions(history: Pose[]): Float32Array {
	if (history.length < 2) return new Float32Array(0)
	const segCount = history.length - 1
	const out = new Float32Array(segCount * 2 * 3)
	let write = 0
	let prev = worldToScene(history[0], LAYER_ELEVATION)
	for (let i = 1; i < history.length; i++) {
		const cur = worldToScene(history[i], LAYER_ELEVATION)
		out[write++] = prev[0]
		out[write++] = prev[1]
		out[write++] = prev[2]
		out[write++] = cur[0]
		out[write++] = cur[1]
		out[write++] = cur[2]
		prev = cur
	}
	return out
}
