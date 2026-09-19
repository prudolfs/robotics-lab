export const CRUISE_SPEED = 0.3
export const TURN_RATE = 0.4
export const SPAWN = { x: 0, y: -2.5, heading: 0 }
const quarterTurn = Math.PI / 2 / TURN_RATE
export const ROUTE = [
	{ label: 'Depart dock', seconds: 2.75 / CRUISE_SPEED, omega: 0 },
	{ label: 'Storage turn', seconds: quarterTurn, omega: TURN_RATE },
	{ label: 'Storage aisle', seconds: 3.5 / CRUISE_SPEED, omega: 0 },
	{ label: 'Workbench turn', seconds: quarterTurn, omega: TURN_RATE },
	{ label: 'Workbench pass', seconds: 5.5 / CRUISE_SPEED, omega: 0 },
	{ label: 'Return turn', seconds: quarterTurn, omega: TURN_RATE },
	{ label: 'Return aisle', seconds: 3.5 / CRUISE_SPEED, omega: 0 },
	{ label: 'Dock turn', seconds: quarterTurn, omega: TURN_RATE },
	{ label: 'Approach dock', seconds: 2.75 / CRUISE_SPEED, omega: 0 },
]
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
