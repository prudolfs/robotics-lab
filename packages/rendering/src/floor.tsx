import { Plane } from '@react-three/drei'

// Offset large enough to survive depth-buffer precision loss when the
// camera is far away — too small a gap and the grid z-fights on zoom/rotate.
const FLOOR_Y = -0.05

/**
 * A solid floor sized to the world, sitting just below the ground plane so the
 * infinite grid draws cleanly on top. Receives soft shading so obstacles cast
 * subtle contact shadows on it.
 */
export function Floor({ width, depth }: { width: number; depth: number }) {
	return (
		<Plane
			args={[width, depth]}
			position={[0, FLOOR_Y, 0]}
			rotation={[-Math.PI / 2, 0, 0]}
			receiveShadow
		>
			<meshStandardMaterial
				color="#1f2937"
				roughness={0.9}
				metalness={0}
				polygonOffset
				polygonOffsetFactor={2}
				polygonOffsetUnits={2}
			/>
		</Plane>
	)
}
