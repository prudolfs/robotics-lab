import type { Pose } from '@robotics-lab/core'
// Canonical coordinates: X forward, Y left, Z up. These are not legacy map coordinates.
export const WORLD = { width: 10, depth: 8 }
export const ROBOT_RADIUS = 0.31
export const OBSTACLES = [
	{ id: 'island', name: 'Equipment island', x: 0, y: 0, width: 3, depth: 2, height: 0.85 },
	{ id: 'workbench', name: 'Workbench', x: -2.3, y: 3.35, width: 3, depth: 0.7, height: 0.9 },
	{ id: 'storage', name: 'Storage', x: 4.35, y: 0.3, width: 0.55, depth: 3, height: 1.45 },
] as const
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
