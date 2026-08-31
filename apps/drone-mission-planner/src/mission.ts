import type { EntityId } from '@robotics-lab/core'
import { distance, type Vec2 } from '@robotics-lab/geometry'
import { radiansToDegrees } from '@robotics-lab/math'

export type MissionWaypoint = {
	id: EntityId
	position: Vec2
	altitude: number
}

export const bootstrapWaypoints: MissionWaypoint[] = [
	{ id: 'wp-01', position: { x: 0, y: 0 }, altitude: 0 },
	{ id: 'wp-02', position: { x: -2.5, y: -1.5 }, altitude: 18 },
	{ id: 'wp-03', position: { x: 3, y: -2.5 }, altitude: 24 },
	{ id: 'wp-04', position: { x: 4.5, y: 3 }, altitude: 16 },
]

export function missionDistance(waypoints: MissionWaypoint[]): number {
	return waypoints.slice(1).reduce((total, waypoint, index) => {
		return total + distance(waypoints[index]?.position ?? waypoint.position, waypoint.position)
	}, 0)
}

export function formatHeading(radians: number): string {
	const degrees = (radiansToDegrees(radians) + 360) % 360
	return `${Math.round(degrees).toString().padStart(3, '0')}°`
}
