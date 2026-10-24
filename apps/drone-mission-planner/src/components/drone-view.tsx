import { useFrame } from '@react-three/fiber'
import { createRotorLayout, type DroneState, type QuadcopterParams } from '@robotics-lab/drone'
import { LabModel } from '@robotics-lab/rendering'
import { Suspense, useRef } from 'react'
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
						<meshStandardMaterial color="#314b55" metalness={0.55} roughness={0.36} />
					</mesh>
				)
			})}

			<group scale={params.bodyRadius / 0.13}>
				<Suspense fallback={null}>
					<LabModel name="drone-body" />
				</Suspense>
			</group>

			{layout.map((motor, index) => (
				<group key={motor.id} position={[motor.position.x, 0.035, motor.position.z]}>
					<mesh castShadow>
						<cylinderGeometry args={[0.052, 0.058, 0.065, 20]} />
						<meshStandardMaterial
							color={motor.position.x > 0 ? '#5bbaaa' : '#263b46'}
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
							<meshStandardMaterial color="#beced1" metalness={0.25} roughness={0.45} />
						</mesh>
						<mesh rotation={[0, Math.PI / 2, 0]}>
							<boxGeometry args={[0.3, 0.008, 0.018]} />
							<meshStandardMaterial color="#718e99" metalness={0.2} roughness={0.5} />
						</mesh>
					</group>
				</group>
			))}

			<group position={[params.bodyRadius + 0.08, 0.075, 0]}>
				<mesh position={[0.04, 0, 0]}>
					<boxGeometry args={[0.12, 0.012, 0.025]} />
					<meshBasicMaterial color="#85dbc5" />
				</mesh>
				<mesh position={[0.12, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
					<coneGeometry args={[0.04, 0.09, 16]} />
					<meshBasicMaterial color="#85dbc5" />
				</mesh>
			</group>
		</group>
	)
}
