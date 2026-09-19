import { multiply, rotate, transpose } from './geometry'
import type { Calibration, Pose3, V3 } from './types'
export type MapObservation = { keyframeId: number; landmarkId: number; pixel: V3 }
export type MapKeyframe = {
	id: number
	frameId: number
	timestamp: number
	pose: Pose3
	calibration: Calibration
}
export type Landmark = {
	id: number
	position: V3
	descriptor: number[]
	observations: MapObservation[]
	seen: number
	lastSeen: number
	quality: number
}
export type BundleReport = {
	before: number
	after: number
	iterations: number
	accepted: boolean
	reason: string
	milliseconds: number
}
export function cameraPoint(pose: Pose3, point: V3): V3 {
	return rotate(transpose(pose.rotation), point.map((v, i) => v - pose.position[i]) as V3)
}
export function worldPoint(pose: Pose3, point: V3): V3 {
	const q = rotate(pose.rotation, point)
	return q.map((v, i) => v + pose.position[i]) as V3
}
export function stereoProjection(pose: Pose3, point: V3, k: Calibration): V3 | null {
	const p = cameraPoint(pose, point)
	if (p[2] <= 0.1) return null
	return [
		(k.fx * p[0]) / p[2] + k.cx,
		(k.fy * p[1]) / p[2] + k.cy,
		(k.fx * (p[0] - k.baseline)) / p[2] + k.cx,
	]
}
const huber = (v: number) => (Math.abs(v) <= 2 ? v * v : 4 * Math.abs(v) - 4)
export function bundleCost(keyframes: MapKeyframe[], landmarks: Landmark[]) {
	const frames = new Map(keyframes.map((f) => [f.id, f]))
	let cost = 0,
		n = 0
	for (const l of landmarks)
		for (const o of l.observations) {
			const f = frames.get(o.keyframeId)
			if (!f) continue
			const p = stereoProjection(f.pose, l.position, f.calibration)
			if (!p) return Infinity
			for (let j = 0; j < 3; j++) {
				cost += huber(p[j] - o.pixel[j])
				n++
			}
		}
	return n ? cost / n : Infinity
}
function solve(a: number[][], b: number[]) {
	const n = b.length,
		m = a.map((r, i) => [...r, b[i]])
	for (let i = 0; i < n; i++) {
		let pivot = i
		for (let j = i + 1; j < n; j++) if (Math.abs(m[j][i]) > Math.abs(m[pivot][i])) pivot = j
		if (!Number.isFinite(m[pivot][i]) || Math.abs(m[pivot][i]) < 1e-10) return null
		;[m[i], m[pivot]] = [m[pivot], m[i]]
		const d = m[i][i]
		for (let j = i; j <= n; j++) m[i][j] /= d
		for (let r = 0; r < n; r++)
			if (r !== i) {
				const s = m[r][i]
				for (let j = i; j <= n; j++) m[r][j] -= s * m[i][j]
			}
	}
	const x = m.map((r) => r[n])
	return x.every(Number.isFinite) ? x : null
}
function increment(p: Pose3, d: number[]): Pose3 {
	const [x, y, z] = d.slice(3),
		theta = Math.hypot(x, y, z),
		a = theta < 1e-8 ? 1 : Math.sin(theta) / theta,
		b = theta < 1e-8 ? 0.5 : (1 - Math.cos(theta)) / (theta * theta)
	const K = [0, -z, y, z, 0, -x, -y, x, 0],
		K2 = multiply(K, K),
		R = K.map((v, i) => (i % 4 === 0 ? 1 : 0) + a * v + b * K2[i])
	return { position: p.position.map((v, i) => v + d[i]) as V3, rotation: multiply(p.rotation, R) }
}
/** Damped block-coordinate Gauss–Newton: alternating 3D point and SE(3) pose blocks.
 * Stereo residuals fix metric scale. The oldest local pose stays fixed to remove the gauge.
 * Only a fully improving finite transaction is committed; callers retain original state otherwise.
 */
export function refineBundle(
	frames: MapKeyframe[],
	points: Landmark[],
	maxIterations = 3,
): BundleReport {
	const start = performance.now(),
		before = bundleCost(frames, points)
	const report: BundleReport = {
		before,
		after: before,
		iterations: 0,
		accepted: false,
		reason: 'Insufficient shared observations',
		milliseconds: 0,
	}
	if (frames.length < 2 || points.filter((p) => p.observations.length >= 2).length < 8)
		return report
	const fs = structuredClone(frames),
		ps = structuredClone(points),
		byId = new Map(fs.map((f) => [f.id, f]))
	let cost = before
	const update = (
		dimension: number,
		residual: (d: number[]) => number[],
		commit: (d: number[]) => void,
	) => {
		const zero = Array(dimension).fill(0),
			r = residual(zero)
		if (r.length < dimension || !r.every(Number.isFinite)) return
		const jac = zero.map((_, j) => {
			const d = [...zero]
			d[j] = 1e-5
			return residual(d).map((v, i) => (v - r[i]) / 1e-5)
		})
		const a = zero.map(() => [...zero]),
			b = [...zero]
		for (let i = 0; i < r.length; i++) {
			const w = Math.min(1, 2 / Math.max(Math.abs(r[i]), 1e-9))
			for (let j = 0; j < dimension; j++) {
				b[j] -= w * jac[j][i] * r[i]
				for (let k = 0; k < dimension; k++) a[j][k] += w * jac[j][i] * jac[k][i]
			}
		}
		// Reject unobservable blocks before damping (flat/singular geometry must not create motion).
		if (!solve(a, [...zero])) return
		for (let j = 0; j < dimension; j++) a[j][j] += 0.01 * Math.max(1, a[j][j])
		const d = solve(a, b)
		if (!d || Math.hypot(...d) > 0.25) return
		const old = r.reduce((s, v) => s + huber(v), 0),
			next = residual(d)
		if (next.every(Number.isFinite) && next.reduce((s, v) => s + huber(v), 0) < old) commit(d)
	}
	const residual = (pose: Pose3, point: V3, o: MapObservation, k: Calibration) => {
		const p = stereoProjection(pose, point, k)
		return p ? p.map((v, j) => v - o.pixel[j]) : [Infinity, Infinity, Infinity]
	}
	for (let iteration = 0; iteration < Math.min(4, maxIterations); iteration++) {
		for (const p of ps) {
			const obs = p.observations.filter((o) => byId.has(o.keyframeId))
			if (obs.length < 2) continue
			update(
				3,
				(d) =>
					obs.flatMap((o) => {
						const f = byId.get(o.keyframeId)
						if (!f) return []
						return residual(f.pose, p.position.map((v, i) => v + d[i]) as V3, o, f.calibration)
					}),
				(d) => {
					p.position = p.position.map((v, i) => v + d[i]) as V3
				},
			)
		}
		for (const f of fs.slice(1)) {
			const obs = ps.flatMap((p) =>
				p.observations.filter((o) => o.keyframeId === f.id).map((o) => ({ p, o })),
			)
			if (obs.length < 8) continue
			update(
				6,
				(d) =>
					obs.flatMap(({ p, o }) => residual(increment(f.pose, d), p.position, o, f.calibration)),
				(d) => {
					f.pose = increment(f.pose, d)
				},
			)
		}
		const next = bundleCost(fs, ps)
		report.iterations++
		if (!Number.isFinite(next) || next > cost + 1e-9) {
			report.reason = 'Non-improving transaction rejected'
			report.milliseconds = performance.now() - start
			return report
		}
		const improvement = cost - next
		cost = next
		if (improvement < 1e-7) break
	}
	if (cost < before - 1e-8) {
		for (let i = 0; i < frames.length; i++) frames[i].pose = fs[i].pose
		for (let i = 0; i < points.length; i++) points[i].position = ps[i].position
		report.accepted = true
		report.after = cost
		report.reason = 'Robust stereo reprojection cost reduced'
	} else report.reason = 'No improving observable step'
	report.milliseconds = performance.now() - start
	return report
}
