import { createWorld, obstacleCount, type World } from '@robotics-lab/core'
import { loadMap } from '@robotics-lab/maps'

export const DEFAULT_MAP_NAME = 'obstacles'
export const WORLD_SCALE_OPTIONS = [0.5, 1, 2] as const

export type WorldScale = (typeof WORLD_SCALE_OPTIONS)[number]

/** Load a built-in simulator map through the shared world normalization path. */
export function loadPlannerWorld(mapName: string): World {
	return createWorld(loadMap(mapName))
}

export function summarizeWorld(world: World) {
	return {
		obstacles: obstacleCount(world),
		area: world.width * world.depth,
	}
}
