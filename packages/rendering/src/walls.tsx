import type { Wall } from '@robotics-lab/maps'
import { worldToScene } from './coords'

const DEFAULT_WALL_ELEVATION = 0.4
const DEFAULT_WALL_THICKNESS = 0.08

const wallKey = (w: Wall, i: number) => `wall-${i}-${w.start.x},${w.start.y}-${w.end.x},${w.end.y}`

/**
 * Render the walls of a map as thin extruded boxes lying on the ground plane.
 * Each wall is built between its start and end world points.
 */
export function Walls({ walls }: { walls: Wall[] }) {
	return (
		<group>
			{walls.map((wall, i) => {
				const height = wall.elevation ?? DEFAULT_WALL_ELEVATION
				const thickness = wall.thickness ?? DEFAULT_WALL_THICKNESS
				const start = worldToScene(wall.start, height / 2)
				const end = worldToScene(wall.end, height / 2)
				const midX = (start[0] + end[0]) / 2
				const midZ = (start[2] + end[2]) / 2
				const length = Math.hypot(end[0] - start[0], end[2] - start[2])
				const angle = Math.atan2(end[2] - start[2], end[0] - start[0])
				return (
					<mesh
						key={wallKey(wall, i)}
						position={[midX, height / 2, midZ]}
						rotation={[0, -angle, 0]}
						castShadow
						receiveShadow
					>
						<boxGeometry args={[length, height, thickness]} />
						<meshStandardMaterial color="#475569" roughness={0.7} />
					</mesh>
				)
			})}
		</group>
	)
}
