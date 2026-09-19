import manifest from '../../../../assets/slam-demo/manifest.json'
export const CRUISE_SPEED = manifest.route.speed
export const TURN_RATE = manifest.route.turnRate
export const SPAWN = manifest.spawn
export const ROUTE = manifest.route.segments.map((segment) => ({
	label: segment.label,
	seconds: segment.angle ? segment.angle / TURN_RATE : segment.length / CRUISE_SPEED,
	omega: segment.angle ? TURN_RATE : 0,
}))
export const ROUTE_DURATION = ROUTE.reduce((sum, segment) => sum + segment.seconds, 0)
export const ROUTE_LENGTH = ROUTE_DURATION * CRUISE_SPEED
export function routeSegment(elapsed: number) {
	let start = 0
	for (const segment of ROUTE) {
		const end = start + segment.seconds
		if (elapsed < end - 1e-10) return { ...segment, end }
		start = end
	}
	return null
}
