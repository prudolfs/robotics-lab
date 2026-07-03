/**
 * Neutral studio lighting: a hemisphere light for soft ambient fill plus a
 * directional light to cast gentle shadows.
 */
export function Lights() {
	return (
		<>
			<hemisphereLight args={[0xffffff, 0x444444, 0.6]} />
			<directionalLight position={[10, 12, 8]} intensity={0.8} />
			<ambientLight intensity={0.2} />
		</>
	)
}
