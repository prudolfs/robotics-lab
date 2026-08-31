import { useFrame } from '@react-three/fiber'
import { createRotorLayout, type DroneState, type QuadcopterParams } from '@robotics-lab/drone'
import { useRef } from 'react'
import type { Group } from 'three'

export function DroneView({ state, params }: { state: DroneState; params: QuadcopterParams }) {
	const rotorGroups = useRef<Array<Group | null>>([])
	const layout = createRotorLayout(params)

	useFrame((_, delta) => {
		for (const [index, motor] of layout.entries()) {
			const rotor = rotorGroups.current[index]
			if (!rotor) continue
			rotor.rotation.y += motor.spinDirection * (state.motorSpeeds[index] ?? 0) * delta * 0.08
		}
	})

	return (
		<group
			position={[state.position.x, state.position.y, state.position.z]}
			quaternion={[
				state.orientation.x,
				state.orientation.y,
				state.orientation.z,
				state.orientation.w,
			]}
		>
			{layout.map((motor) => {
				const angle = Math.atan2(motor.position.z, motor.position.x)
				const length = Math.hypot(motor.position.x, motor.position.z)
				return (
					<mesh
						castShadow
						key={`arm-${motor.id}`}
						position={[motor.position.x / 2, 0, motor.position.z / 2]}
						rotation={[0, -angle, 0]}
					>
						<boxGeometry args={[length, 0.035, 0.045]} />
						<meshStandardMaterial color="#36443e" metalness={0.55} roughness={0.36} />
					</mesh>
				)
			})}

			<mesh castShadow scale={[1, 0.42, 1]}>
				<sphereGeometry args={[params.bodyRadius, 32, 18]} />
				<meshStandardMaterial color="#121c18" metalness={0.45} roughness={0.32} />
			</mesh>
			<mesh castShadow position={[0, 0.045, 0]}>
				<cylinderGeometry args={[params.bodyRadius * 0.65, params.bodyRadius * 0.8, 0.045, 24]} />
				<meshStandardMaterial color="#e89439" metalness={0.25} roughness={0.4} />
			</mesh>

			{layout.map((motor, index) => (
				<group key={motor.id} position={[motor.position.x, 0.035, motor.position.z]}>
					<mesh castShadow>
						<cylinderGeometry args={[0.052, 0.058, 0.065, 20]} />
						<meshStandardMaterial
							color={motor.position.x > 0 ? '#e89439' : '#26342e'}
							metalness={0.5}
							roughness={0.32}
						/>
					</mesh>
					<group
						position={[0, 0.045, 0]}
						ref={(node) => {
							rotorGroups.current[index] = node
						}}
					>
						<mesh castShadow>
							<boxGeometry args={[0.3, 0.008, 0.026]} />
							<meshStandardMaterial color="#c9d2cc" metalness={0.25} roughness={0.45} />
						</mesh>
						<mesh rotation={[0, Math.PI / 2, 0]}>
							<boxGeometry args={[0.3, 0.008, 0.018]} />
							<meshStandardMaterial color="#7e9086" metalness={0.2} roughness={0.5} />
						</mesh>
					</group>
				</group>
			))}

			<group position={[params.bodyRadius + 0.08, 0.075, 0]}>
				<mesh position={[0.04, 0, 0]}>
					<boxGeometry args={[0.12, 0.012, 0.025]} />
					<meshBasicMaterial color="#ffbc65" />
				</mesh>
				<mesh position={[0.12, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
					<coneGeometry args={[0.04, 0.09, 16]} />
					<meshBasicMaterial color="#ffbc65" />
				</mesh>
			</group>
		</group>
	)
}
