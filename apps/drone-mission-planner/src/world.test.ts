import { mapNames } from '@robotics-lab/maps'
import { DEFAULT_MAP_NAME, loadPlannerWorld, summarizeWorld, WORLD_SCALE_OPTIONS } from './world'

describe('planner world', () => {
	it('loads the simulator obstacle map through the shared map loader', () => {
		const world = loadPlannerWorld(DEFAULT_MAP_NAME)

		expect(mapNames()).toContain(DEFAULT_MAP_NAME)
		expect(world.name).toBe(DEFAULT_MAP_NAME)
		expect(world.walls).toHaveLength(4)
		expect(world.boxes.length).toBeGreaterThan(0)
		expect(world.cylinders.length).toBeGreaterThan(0)
	})

	it('summarizes normalized world geometry', () => {
		expect(summarizeWorld(loadPlannerWorld(DEFAULT_MAP_NAME))).toEqual({
			obstacles: 9,
			area: 100,
		})
	})

	it('exposes bounded display scale options', () => {
		expect(WORLD_SCALE_OPTIONS).toEqual([0.5, 1, 2])
	})
})
