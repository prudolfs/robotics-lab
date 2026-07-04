import type { Pose } from '@robotics-lab/core'
import type { RobotParams } from '@robotics-lab/robot'
import { worldToScene } from './coords'

const BODY_LENGTH = 0.4
const BODY_WIDTH = 0.28
const BODY_HEIGHT = 0.12
const BODY_ELEVATION = 0.08

const WHEEL_RADIUS = 0.05
const WHEEL_WIDTH = 0.03
const WHEEL_ELEVATION = WHEEL_RADIUS

const HEADING_LENGTH = 0.18
const HEADING_OFFSET = BODY_LENGTH / 2

export type RobotViewProps = {
	pose: Pose
	params?: RobotParams
}

/**
 * Renders a differential-drive robot at a pose:
 * a chassis cuboid, two side wheels, and a forward heading indicator arrow.
 *
 * The robot model is purely visual here — rendering only observes the
 * simulation's robot pose and never owns it.
 */
export function RobotView({ pose, params }: RobotViewProps) {
	const wheelBase = params?.wheelBase ?? 0.4
	const [x, y, z] = worldToScene(pose, 0)
	// World frame is x/y; the robot's forward axis is its heading. In the scene
	// the robot lies on the x/z plane with y up, so we rotate about the scene y
	// axis. The negative sign maps world heading onto the scene's left-handed y.
	const yaw = -pose.heading
	const halfBase = wheelBase / 2

	return (
		<group position={[x, y, z]} rotation={[0, yaw, 0]}>
			<Body />
			<HeadingArrow />
			{/* left wheel (scene -z side) */}
			<Wheel position={[0, WHEEL_ELEVATION, -halfBase]} />
			{/* right wheel (scene +z side) */}
			<Wheel position={[0, WHEEL_ELEVATION, halfBase]} />
		</group>
	)
}

function Body() {
	return (
		<mesh position={[0, BODY_ELEVATION, 0]} castShadow receiveShadow>
			<boxGeometry args={[BODY_LENGTH, BODY_HEIGHT, BODY_WIDTH]} />
			<meshStandardMaterial color="#e5e7eb" roughness={0.5} metalness={0.1} />
		</mesh>
	)
}

function HeadingArrow() {
	return (
		<mesh position={[HEADING_OFFSET, BODY_ELEVATION, 0]} castShadow>
			<boxGeometry args={[HEADING_LENGTH, 0.03, 0.05]} />
			<meshStandardMaterial
				color="#22c55e"
				roughness={0.4}
				emissive="#16a34a"
				emissiveIntensity={0.3}
			/>
		</mesh>
	)
}

function Wheel({ position }: { position: [number, number, number] }) {
	return (
		<mesh position={position} rotation={[0, 0, Math.PI / 2]} castShadow>
			<cylinderGeometry args={[WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 24]} />
			<meshStandardMaterial color="#111827" roughness={0.7} />
		</mesh>
	)
}
