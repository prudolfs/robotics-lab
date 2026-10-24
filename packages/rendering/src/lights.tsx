/**
 * Neutral studio lighting: a hemisphere light for soft ambient fill plus a
 * directional light to cast gentle shadows.
 */
export function Lights() {
	return (
		<>
			<hemisphereLight args={['#d0e4e2', '#344751', 1.2]} />
			<directionalLight position={[10, 12, 8]} intensity={2} color="#ffe5c5" />
			<directionalLight position={[-8, 6, -10]} intensity={0.7} color="#a9d9ec" />
			<ambientLight intensity={0.3} />
		</>
	)
}
