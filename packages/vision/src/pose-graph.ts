import { identity, multiply, rotate, transpose } from './geometry'
import type { Pose3, V3 } from './types'
export type GraphNode = { id: number; frameId: number; pose: Pose3 }
export type GraphEdge = { from: number; to: number; measurement: Pose3; kind: 'odometry' | 'loop' }
export type GraphJob = { version: number; nodes: GraphNode[]; edges: GraphEdge[] }
export type GraphResult = GraphJob & {
	before: number
	after: number
	iterations: number
	accepted: boolean
	milliseconds: number
}
export type GraphScheduler = (job: GraphJob, done: (result: GraphResult) => void) => void
export function inverse(p: Pose3): Pose3 {
	const r = transpose(p.rotation)
	return { rotation: r, position: rotate(r, p.position.map((v) => -v) as V3) }
}
export function compose(a: Pose3, b: Pose3): Pose3 {
	const p = rotate(a.rotation, b.position)
	return {
		rotation: multiply(a.rotation, b.rotation),
		position: p.map((v, i) => v + a.position[i]) as V3,
	}
}
export const relative = (a: Pose3, b: Pose3) => compose(inverse(a), b)
export function rotationVector(r: number[]): V3 {
	// Matrix -> unit quaternion, with a stable branch near a half turn.
	const trace = r[0] + r[4] + r[8]
	let w: number, x: number, y: number, z: number
	if (trace > 0) {
		const s = Math.sqrt(trace + 1) * 2
		w = s / 4
		x = (r[7] - r[5]) / s
		y = (r[2] - r[6]) / s
		z = (r[3] - r[1]) / s
	} else if (r[0] > r[4] && r[0] > r[8]) {
		const s = Math.sqrt(1 + r[0] - r[4] - r[8]) * 2
		w = (r[7] - r[5]) / s
		x = s / 4
		y = (r[1] + r[3]) / s
		z = (r[2] + r[6]) / s
	} else if (r[4] > r[8]) {
		const s = Math.sqrt(1 + r[4] - r[0] - r[8]) * 2
		w = (r[2] - r[6]) / s
		x = (r[1] + r[3]) / s
		y = s / 4
		z = (r[5] + r[7]) / s
	} else {
		const s = Math.sqrt(1 + r[8] - r[0] - r[4]) * 2
		w = (r[3] - r[1]) / s
		x = (r[2] + r[6]) / s
		y = (r[5] + r[7]) / s
		z = s / 4
	}
	const n = Math.hypot(x, y, z),
		scale = n < 1e-9 ? 2 : ((2 * Math.atan2(n, Math.abs(w))) / n) * (w < 0 ? -1 : 1)
	return [x * scale, y * scale, z * scale]
}
export function incrementPose(p: Pose3, d: number[]): Pose3 {
	const [x, y, z] = d.slice(3),
		theta = Math.hypot(x, y, z),
		a = theta < 1e-8 ? 1 : Math.sin(theta) / theta,
		b = theta < 1e-8 ? 0.5 : (1 - Math.cos(theta)) / (theta * theta),
		K = [0, -z, y, z, 0, -x, -y, x, 0],
		K2 = multiply(K, K)
	return {
		position: p.position.map((v, i) => v + d[i]) as V3,
		rotation: multiply(
			p.rotation,
			K.map((v, i) => (i % 4 === 0 ? 1 : 0) + a * v + b * K2[i]),
		),
	}
}
function residual(a: Pose3, b: Pose3, e: GraphEdge) {
	const error = compose(inverse(e.measurement), relative(a, b)),
		weight = e.kind === 'loop' ? 3 : 1
	return [
		...error.position.map((v) => (v / 0.04) * weight),
		...rotationVector(error.rotation).map((v) => (v / 0.025) * weight),
	]
}
const robust = (n: number) => (n <= 3 ? n * n : 6 * n - 9)
export function graphCost(nodes: GraphNode[], edges: GraphEdge[]) {
	const index = new Map(nodes.map((n) => [n.id, n.pose]))
	let cost = 0
	for (const e of edges) {
		const a = index.get(e.from),
			b = index.get(e.to)
		if (!a || !b) return Infinity
		cost += robust(Math.hypot(...residual(a, b, e)))
	}
	return cost
}
/** Anchored SE(3) nonlinear least squares with Huber weighting and sparse matrix-free PCG. */
export function optimizeGraph(job: GraphJob): GraphResult {
	const start = performance.now(),
		nodes = structuredClone(job.nodes),
		index = new Map(nodes.map((n, i) => [n.id, i])),
		size = (nodes.length - 1) * 6,
		before = graphCost(nodes, job.edges)
	const result: GraphResult = {
		...job,
		nodes,
		before,
		after: before,
		iterations: 0,
		accepted: false,
		milliseconds: 0,
	}
	if (
		nodes.length < 2 ||
		nodes.length > 160 ||
		job.edges.length > 176 ||
		!Number.isFinite(before) ||
		size === 0
	)
		return result
	let cost = before
	for (let iteration = 0; iteration < 6; iteration++) {
		const gradient = new Float64Array(size),
			diagonal = new Float64Array(size).fill(0.001)
		const blocks = job.edges.map((e) => {
			const ia = index.get(e.from) ?? 0,
				ib = index.get(e.to) ?? 0,
				a = nodes[ia].pose,
				b = nodes[ib].pose,
				r = residual(a, b, e),
				w = Math.min(1, 3 / Math.max(1e-12, Math.hypot(...r)))
			const jac = (side: number) =>
				Array.from({ length: 6 }, (_, j) => {
					const d = Array(6).fill(0)
					d[j] = 1e-5
					const v =
						side === 0 ? residual(incrementPose(a, d), b, e) : residual(a, incrementPose(b, d), e)
					return v.map((v, i) => (v - r[i]) / 1e-5)
				})
			const sides = [
				{ offset: (ia - 1) * 6, j: jac(0) },
				{ offset: (ib - 1) * 6, j: jac(1) },
			].filter((s) => s.offset >= 0)
			for (const s of sides)
				for (let c = 0; c < 6; c++)
					for (let row = 0; row < 6; row++) {
						gradient[s.offset + c] -= w * s.j[c][row] * r[row]
						diagonal[s.offset + c] += w * s.j[c][row] ** 2
					}
			return { sides, w }
		})
		const product = (x: Float64Array) => {
			const y = Float64Array.from(x, (v) => v * 0.001)
			for (const block of blocks) {
				const q = Array(6).fill(0)
				for (const s of block.sides)
					for (let c = 0; c < 6; c++)
						for (let r = 0; r < 6; r++) q[r] += s.j[c][r] * x[s.offset + c]
				for (const s of block.sides)
					for (let c = 0; c < 6; c++)
						for (let r = 0; r < 6; r++) y[s.offset + c] += block.w * s.j[c][r] * q[r]
			}
			return y
		}
		const dot = (a: Float64Array, b: Float64Array) => a.reduce((s, v, i) => s + v * b[i], 0),
			x = new Float64Array(size),
			r = gradient.slice(),
			z = Float64Array.from(r, (v, i) => v / diagonal[i])
		let direction = z.slice(),
			rz = dot(r, z)
		for (let step = 0; step < 100 && rz > 1e-12; step++) {
			const ad = product(direction),
				denom = dot(direction, ad)
			if (!Number.isFinite(denom) || denom <= 1e-14) break
			const alpha = rz / denom
			for (let i = 0; i < size; i++) {
				x[i] += alpha * direction[i]
				r[i] -= alpha * ad[i]
				z[i] = r[i] / diagonal[i]
			}
			const next = dot(r, z),
				beta = next / rz
			for (let i = 0; i < size; i++) direction[i] = z[i] + beta * direction[i]
			rz = next
		}
		if (!Array.from(x).every(Number.isFinite)) break
		let accepted = false
		for (const scale of [1, 0.5, 0.25, 0.125]) {
			const trial = nodes.map((n, i) =>
					i === 0
						? n
						: {
								...n,
								pose: incrementPose(
									n.pose,
									Array.from(x.subarray((i - 1) * 6, i * 6), (v) => v * scale),
								),
							},
				),
				next = graphCost(trial, job.edges)
			if (Number.isFinite(next) && next < cost - 1e-8) {
				for (let i = 1; i < nodes.length; i++) nodes[i].pose = trial[i].pose
				cost = next
				accepted = true
				break
			}
		}
		result.iterations++
		if (!accepted) break
	}
	result.after = cost
	result.accepted = cost < before - 1e-6
	result.milliseconds = performance.now() - start
	return result
}
export const emptyPose = identity
