// Navigation visualization: renders the goal queue as a chain of markers plus
// a planned-trajectory polyline from the robot through every queued goal.
//
// The component only observes the immutable `goals` array and the robot pose —
// it owns no simulation state. The store / `App` feed it a fresh snapshot each
// render so the markers "place" live as the user clicks and the polyline
// "retracts" as the robot reaches each goal and the queue advances.
//
// Conventions:
//   - markers are flat rings on the floor (red = active goal head, blue =
//     pending goals behind it) sized to a constant screen-ish radius
//   - the trajectory line connects the robot's current pose to the queue in
//     order, drawn flat at a small elevation so it sits above the floor grid
//   - everything uses the shared `worldToScene` mapping so the layout matches
//     the robot, the lidar and the occupancy grid exactly.

import type { Pose } from '@robotics-lab/core'
import type { Goal } from '@robotics-lab/navigation'
import { useMemo } from 'react'
import * as THREE from 'three'
import { worldToScene } from './coords'

/** Elevation of the markers / trajectory line over the ground plane. */
const LAYER_ELEVATION = 0.04
/** Ring outer radius of each goal marker, in world units (metres). */
const MARKER_RADIUS = 0.18
/** Ring tube thickness. */
const RING_TUBE = 0.04

const ACTIVE_COLOR = 0xef4444
const PENDING_COLOR = 0x38bdf8
const TRAJECTORY_COLOR = 0xfbbf24

export type GoalViewProps = {
	/** Robot pose, used as the trajectory's start point. */
	pose: Pose
	/** Queued goals in travel order (head first). Empty draws nothing. */
	goals: Goal[]
}

/**
 * Render the queued navigation goals and the planned trajectory from the robot
 * through the queue. Returns null when there is nothing to draw.
 */
export function GoalView({ pose, goals }: GoalViewProps) {
	if (goals.length === 0) return null
	return (
		<group>
			<Trajectory pose={pose} goals={goals} />
			<Markers goals={goals} />
		</group>
	)
}

/**
 * Render one marker per queued goal. The map is kept small and pulled into a
 * helper component so React reconciliation is straightforward. The key mixes
 * the coordinates with the queue index because the user is allowed to queue
 * the same world point more than once (duplicate waypoints are legitimate).
 */
function Markers({ goals }: { goals: Goal[] }) {
	const markers = goals.map((goal, index) => ({
		goal,
		active: index === 0,
		key: `${goal.x}:${goal.y}:${index}`,
	}))
	return (
		<>
			{markers.map((m) => (
				<GoalMarker key={m.key} goal={m.goal} active={m.active} />
			))}
		</>
	)
}

/** A flat ring marker on the floor at a goal location. */
function GoalMarker({ goal, active }: { goal: Goal; active: boolean }) {
	const [x, y, z] = worldToScene(goal, LAYER_ELEVATION + (active ? 0.001 : 0))
	const color = active ? ACTIVE_COLOR : PENDING_COLOR
	return (
		<mesh position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
			<torusGeometry args={[MARKER_RADIUS, RING_TUBE, 12, 32]} />
			<meshBasicMaterial
				color={color}
				transparent
				opacity={active ? 0.95 : 0.7}
				depthWrite={false}
			/>
		</mesh>
	)
}

/**
 * Polyline from the robot pose through every queued goal, drawn as a
 * `lineSegments` (pairs) instead of a connected `<line>` because R3F's JSX
 * `<line>` collides with the SVG `line` element in TypeScript.
 */
function Trajectory({ pose, goals }: { pose: Pose; goals: Goal[] }) {
	const positions = useMemo(() => buildSegmentPositions(pose, goals), [pose, goals])
	const geometry = useMemo(
		() =>
			new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3)),
		[positions],
	)
	return (
		<lineSegments geometry={geometry}>
			<lineBasicMaterial color={TRAJECTORY_COLOR} transparent opacity={0.8} />
		</lineSegments>
	)
}

/** Segment-pair vertex buffer: [start0,end0, start1,end1, ...]. One segment
 *  per step of the path (robot->goal1, goal1->goal2, ...). */
function buildSegmentPositions(pose: Pose, goals: Goal[]): Float32Array {
	const lineCount = goals.length
	const positions = new Float32Array(lineCount * 2 * 3)
	let cursor = worldToScene(pose, LAYER_ELEVATION)
	let write = 0
	for (let i = 0; i < lineCount; i++) {
		positions[write++] = cursor[0]
		positions[write++] = cursor[1]
		positions[write++] = cursor[2]
		cursor = worldToScene(goals[i], LAYER_ELEVATION)
		positions[write++] = cursor[0]
		positions[write++] = cursor[1]
		positions[write++] = cursor[2]
	}
	return positions
}
