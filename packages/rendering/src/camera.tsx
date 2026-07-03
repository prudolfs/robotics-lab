import { OrbitControls, PerspectiveCamera } from '@react-three/drei'

/**
 * A perspective camera positioned to overview the world, plus orbit controls
 * so the user can inspect the scene from any angle.
 */
export function SimulatorCamera() {
	return (
		<>
			<PerspectiveCamera makeDefault position={[6, 6, 6]} fov={50} near={0.1} far={1000} />
			<OrbitControls makeDefault />
		</>
	)
}
