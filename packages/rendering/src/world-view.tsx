import type { World } from '@robotics-lab/core'
import { Boxes } from './boxes'
import { Cylinders } from './cylinders'
import { Floor } from './floor'
import { Walls } from './walls'

/**
 * Renders the static world: floor, walls, boxes and cylinders. The world data
 * is read-only here — rendering only observes the simulation's world model.
 */
export function WorldView({ world }: { world: World }) {
	return (
		<group>
			<Floor width={world.width} depth={world.depth} />
			<Walls walls={world.walls.map((w) => ({ start: w.start, end: w.end }))} />
			<Boxes
				boxes={world.boxes.map((b) => ({
					center: b.center,
					width: b.width,
					depth: b.depth,
					rotation: b.rotation,
				}))}
			/>
			<Cylinders
				cylinders={world.cylinders.map((c) => ({
					center: c.center,
					diameter: c.radius * 2,
				}))}
			/>
		</group>
	)
}
