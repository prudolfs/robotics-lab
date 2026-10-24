import type { World } from '@robotics-lab/core'
import { cellCenterWorld, type OccupancyGrid } from '@robotics-lab/occupancy-grid'
import type { RobotParams } from '@robotics-lab/robot'
import { motionIsClear, NAV_CLEARANCE, robotFootprintRadius } from './collision'

const cache = new WeakMap<World, Map<string, OccupancyGrid>>()

/** Known-map cost layer, separate from the noisy, learned lidar occupancy map.
 * Inflate by the full turning footprint plus a half-cell raster margin.
 * The resulting polyline is also checked against exact world geometry. Never route through the grid's margin.
 */
export function navigationGrid(
	world: World,
	template: OccupancyGrid,
	params: RobotParams,
	extraInflation = 0,
): OccupancyGrid {
	const radius =
		robotFootprintRadius(params) +
		NAV_CLEARANCE +
		template.resolution * (0.5 + Math.max(0, extraInflation))
	const key = `${template.width}:${template.height}:${template.resolution}:${template.origin.x}:${template.origin.y}:${radius}`
	let grids = cache.get(world)
	if (!grids) {
		grids = new Map()
		cache.set(world, grids)
	}
	const existing = grids.get(key)
	if (existing) return existing
	const cells = new Float32Array(template.width * template.height)
	for (let row = 0; row < template.height; row++) {
		for (let col = 0; col < template.width; col++) {
			const point = cellCenterWorld(template, col, row)
			cells[row * template.width + col] = motionIsClear(world, point, point, radius) ? -4 : 4
		}
	}
	const grid = { ...template, cells }
	// Robot editor sliders should not retain an unbounded collection of costmaps.
	if (grids.size >= 8) grids.clear()
	grids.set(key, grid)
	return grid
}
