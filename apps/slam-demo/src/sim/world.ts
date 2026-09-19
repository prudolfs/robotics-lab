import type { Pose } from '@robotics-lab/core'
import manifest from '../../../../assets/slam-demo/manifest.json'
// Canonical coordinates: X forward, Y left, Z up. These are not legacy map coordinates.
export const WORLD = manifest.world
export const ROBOT_RADIUS = manifest.robot.radius
export const OBSTACLES = manifest.obstacles
export function collides(pose: Pick<Pose, 'x' | 'y'>): boolean {
	if (
		Math.abs(pose.x) + ROBOT_RADIUS > WORLD.width / 2 ||
		Math.abs(pose.y) + ROBOT_RADIUS > WORLD.depth / 2
	)
		return true
	return OBSTACLES.some((o) => {
		const x = Math.max(o.x - o.width / 2, Math.min(pose.x, o.x + o.width / 2))
		const y = Math.max(o.y - o.depth / 2, Math.min(pose.y, o.y + o.depth / 2))
		return Math.hypot(pose.x - x, pose.y - y) < ROBOT_RADIUS
	})
}
export function scenePosition(p: Pick<Pose, 'x' | 'y'>, height = 0): [number, number, number] {
	return [p.x, height, -p.y]
}
