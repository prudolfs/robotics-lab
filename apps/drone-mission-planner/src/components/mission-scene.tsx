import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { CoordinateAxes, Lights, WorldView, worldToScene } from '@robotics-lab/rendering'
import { Quaternion, Vector3 } from 'three'
import { bootstrapWaypoints } from '@/mission'
import { usePlannerStore } from '@/store'

const route = bootstrapWaypoints.map((waypoint) =>
	worldToScene(waypoint.position, Math.max(0.06, waypoint.altitude / 8)),
)

const up = new Vector3(0, 1, 0)

function RouteSegment({
	start,
	end,
}: {
	start: [number, number, number]
	end: [number, number, number]
}) {
	const startVector = new Vector3(...start)
	const endVector = new Vector3(...end)
	const direction = endVector.clone().sub(startVector)
	const midpoint = startVector.clone().add(endVector).multiplyScalar(0.5)
	const quaternion = new Quaternion().setFromUnitVectors(up, direction.clone().normalize())

	return (
		<mesh position={midpoint} quaternion={quaternion}>
			<cylinderGeometry args={[0.018, 0.018, direction.length(), 8]} />
			<meshBasicMaterial color="#ffb85c" />
		</mesh>
	)
}

function WebGPUGrid({ size }: { size: number }) {
	const minorDivisions = Math.round(size * 2)
	const majorDivisions = Math.max(1, Math.round(size / 2))

	return (
		<group position={[0, -0.015, 0]}>
			<gridHelper args={[size, minorDivisions, '#68786f', '#87938b']} />
			<gridHelper args={[size, majorDivisions, '#46564e', '#68786f']} position={[0, 0.004, 0]} />
		</group>
	)
}

function StagingRoute() {
	return (
		<group>
			{route.slice(1).map((point, index) => (
				<RouteSegment
					key={`route-${bootstrapWaypoints[index]?.id}`}
					start={route[index] ?? point}
					end={point}
				/>
			))}
			{route.map((position, index) => (
				<group key={bootstrapWaypoints[index]?.id} position={position}>
					<mesh>
						<sphereGeometry args={[index === 0 ? 0.16 : 0.11, 20, 20]} />
						<meshStandardMaterial color={index === 0 ? '#ffd08c' : '#f07a4b'} roughness={0.45} />
					</mesh>
					{index > 0 && (
						<mesh position={[0, -position[1] / 2, 0]}>
							<cylinderGeometry args={[0.008, 0.008, position[1], 8]} />
							<meshBasicMaterial color="#dba76c" transparent opacity={0.35} />
						</mesh>
					)}
				</group>
			))}
			<mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
				<ringGeometry args={[0.42, 0.48, 48]} />
				<meshBasicMaterial color="#ffbd6a" />
			</mesh>
		</group>
	)
}

export function MissionScene() {
	const world = usePlannerStore((state) => state.world)
	const worldScale = usePlannerStore((state) => state.worldScale)
	const gridSize = Math.max(world.width, world.depth) * 6

	return (
		<>
			<PerspectiveCamera makeDefault position={[9, 7, 10]} fov={47} near={0.1} far={500} />
			<OrbitControls
				makeDefault
				enableDamping
				dampingFactor={0.08}
				maxPolarAngle={Math.PI / 2.05}
			/>
			<Lights />
			<group scale={worldScale}>
				<WebGPUGrid size={gridSize} />
				<WorldView world={world} />
				<CoordinateAxes />
				<StagingRoute />
			</group>
			<fog attach="fog" args={['#b9c1b6', 20, 68]} />
		</>
	)
}
