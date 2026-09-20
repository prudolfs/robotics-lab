import { expect, it } from 'vitest'
import { identity } from './geometry'
import {
	compose,
	type GraphEdge,
	incrementPose,
	inverse,
	optimizeGraph,
	relative,
	rotationVector,
} from './pose-graph'

it('SE(3) inversion and stable half-turn logarithm preserve rigid poses', () => {
	const pose = incrementPose(identity(), [0.3, -0.2, 0.5, 0.2, -0.1, 0.3]),
		cycle = compose(pose, inverse(pose))
	expect(Math.hypot(...cycle.position)).toBeLessThan(1e-10)
	expect(Math.hypot(...rotationVector(cycle.rotation))).toBeLessThan(1e-10)
	expect(
		Math.hypot(...rotationVector(incrementPose(identity(), [0, 0, 0, Math.PI, 0, 0]).rotation)),
	).toBeCloseTo(Math.PI, 8)
})
it('an anchored robust 3D graph reduces a verified loop residual and accumulated drift', () => {
	const truth = Array.from({ length: 24 }, (_, i) =>
		incrementPose(identity(), [
			Math.sin((i * Math.PI * 2) / 23),
			0.1 * Math.sin(i * 0.7),
			1 - Math.cos((i * Math.PI * 2) / 23),
			0,
			(i * Math.PI * 2) / 23,
			0,
		]),
	)
	// Final truth view repeats the first orientation and position, with a small 3D oscillation.
	truth[23] = identity()
	const nodes = truth.map((pose, id) => ({
		id,
		frameId: id,
		pose: incrementPose(pose, [id * 0.009, id * 0.002, -id * 0.004, 0, id * 0.001, 0]),
	}))
	const edges: GraphEdge[] = nodes.slice(1).map((n, i) => ({
		from: i,
		to: n.id,
		measurement: relative(nodes[i].pose, n.pose),
		kind: 'odometry',
	}))
	edges.push({ from: 0, to: 23, measurement: identity(), kind: 'loop' })
	const before = structuredClone(nodes),
		result = optimizeGraph({ version: 1, nodes, edges })
	expect(result.accepted).toBe(true)
	expect(result.after).toBeLessThan(result.before * 0.1)
	expect(result.nodes[0]).toEqual(before[0])
	expect(nodes).toEqual(before)
	const rms = (values: typeof nodes) =>
		Math.sqrt(
			values.reduce(
				(s, n, i) =>
					s + n.pose.position.reduce((s, v, j) => s + (v - truth[i].position[j]) ** 2, 0),
				0,
			) / values.length,
		)
	expect(rms(result.nodes)).toBeLessThan(rms(before))
	expect(result.iterations).toBeLessThanOrEqual(6)
})
it('a consistent no-loop graph is unchanged and invalid constraints do not publish corrections', () => {
	const nodes = [
		{ id: 0, frameId: 0, pose: identity() },
		{ id: 1, frameId: 1, pose: incrementPose(identity(), [1, 0, 0, 0, 0.1, 0]) },
	]
	const edges: GraphEdge[] = [
		{ from: 0, to: 1, measurement: relative(nodes[0].pose, nodes[1].pose), kind: 'odometry' },
	]
	expect(optimizeGraph({ version: 0, nodes, edges }).accepted).toBe(false)
	expect(optimizeGraph({ version: 0, nodes, edges: [{ ...edges[0], to: 99 }] }).accepted).toBe(
		false,
	)
})
