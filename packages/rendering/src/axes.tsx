/**
 * RGB coordinate axes: x = red, y = green, z = blue. Placed at the world origin
 * so the heading convention stays obvious across every view.
 */
export function CoordinateAxes() {
	const length = 1
	const radius = 0.02
	return (
		<group>
			{/* x axis - red */}
			<mesh position={[length / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
				<cylinderGeometry args={[radius, radius, length, 12]} />
				<meshBasicMaterial color="#ef4444" />
			</mesh>
			{/* y axis - green (up in three space) */}
			<mesh position={[0, length / 2, 0]}>
				<cylinderGeometry args={[radius, radius, length, 12]} />
				<meshBasicMaterial color="#22c55e" />
			</mesh>
			{/* z axis - blue */}
			<mesh position={[0, 0, length / 2]} rotation={[Math.PI / 2, 0, 0]}>
				<cylinderGeometry args={[radius, radius, length, 12]} />
				<meshBasicMaterial color="#3b82f6" />
			</mesh>
		</group>
	)
}
