import {
	type BundleReport,
	bundleCost,
	cameraPoint,
	type Landmark,
	type MapKeyframe,
	refineBundle,
	stereoProjection,
	worldPoint,
} from './bundle'
import { coverage, identity, integrate, multiply, transpose } from './geometry'
import type { Calibration, Pixel, Pose3, V3 } from './types'
export const MAP_LIMITS = {
	landmarks: 1000,
	keyframes: 12,
	localFrames: 4,
	localPoints: 120,
	iterations: 3,
} as const
export type BundleJob = { graph: number; frames: MapKeyframe[]; points: Landmark[] }
export type BundleResult = BundleJob & { report: BundleReport }
export type BundleScheduler = (job: BundleJob, done: (result: BundleResult) => void) => void
export function runBundleJob(job: BundleJob): BundleResult {
	return { ...job, report: refineBundle(job.frames, job.points, MAP_LIMITS.iterations) }
}
export type MapSnapshot = {
	optimizationPending: boolean
	bundleRevision: number
	revision: number
	frameId: number
	pose: Pose3
	landmarks: Landmark[]
	keyframes: MapKeyframe[]
	mapMatches: number
	trackingSource: 'local map' | 'stereo odometry'
	culledLandmarks: number
	culledKeyframes: number
	bundle: BundleReport | null
	updateMs: number
}
export type StereoSample = { pixel: Pixel; point: V3; descriptor: number[] }
export function descriptor(image: Uint8Array, p: Pixel, k: Calibration) {
	const x = Math.round(p[0]),
		y = Math.round(p[1]),
		values: number[] = []
	if (x < 4 || y < 4 || x >= k.width - 4 || y >= k.height - 4) return []
	for (let dy = -3; dy <= 3; dy++)
		for (let dx = -3; dx <= 3; dx++) values.push(image[(y + dy) * k.width + x + dx])
	const mean = values.reduce((a, b) => a + b, 0) / 49,
		norm = Math.hypot(...values.map((v) => v - mean))
	return norm > 5 ? values.map((v) => (v - mean) / norm) : []
}
export function descriptorDistance(a: number[], b: number[]) {
	return a.length === 49 && b.length === 49 ? 1 - a.reduce((s, v, i) => s + v * b[i], 0) : Infinity
}
type Solver = (
	points: V3[],
	pixels: Pixel[],
) => { r: number[]; t: V3; inliers: number[]; rmse: number } | null
export function createLocalMap(
	k: Calibration,
	schedule: BundleScheduler = (job, done) => done(runBundleJob(job)),
) {
	let busy = false,
		completed: BundleResult | null = null,
		bundleRevision = 0
	function commit(current: Pose3): Pose3 {
		if (!completed) return current
		const result = completed
		completed = null
		busy = false
		bundleRevision++
		lastBundle = result.report
		if (result.graph !== nextFrame) {
			lastBundle = {
				...result.report,
				accepted: false,
				after: result.report.before,
				reason: 'Stale optimization graph rejected',
			}
			return current
		}
		if (!result.report.accepted) return current
		const oldFrame = frames.at(-1)
		const newFrame = result.frames.find((f) => f.id === oldFrame?.id)
		if (!oldFrame || !newFrame) return current
		const trialFrames = frames.map((f) => result.frames.find((q) => q.id === f.id) ?? f)
		const trialPoints = points.map((p) => ({
			...p,
			position: result.points.find((q) => q.id === p.id)?.position ?? p.position,
		}))
		const candidateCost = bundleCost(trialFrames, trialPoints)
		if (!Number.isFinite(candidateCost) || candidateCost > bundleCost(frames, points)) {
			lastBundle = {
				...lastBundle,
				accepted: false,
				after: lastBundle.before,
				reason: 'Boundary observations worsened; transaction rejected',
			}
			return current
		}
		const corrected: Pose3 = {
			position: worldPoint(newFrame.pose, cameraPoint(oldFrame.pose, current.position)),
			rotation: multiply(
				multiply(newFrame.pose.rotation, transpose(oldFrame.pose.rotation)),
				current.rotation,
			),
		}
		frames = trialFrames
		points = trialPoints
		return corrected
	}
	let frames: MapKeyframe[] = [],
		points: Landmark[] = [],
		nextPoint = 0,
		nextFrame = 0,
		revision = 0,
		culledLandmarks = 0,
		culledKeyframes = 0,
		lastBundle: BundleReport | null = null,
		lastSnapshot: MapSnapshot | undefined
	function removeFrame(id: number) {
		frames = frames.filter((f) => f.id !== id)
		for (const p of points) p.observations = p.observations.filter((o) => o.keyframeId !== id)
		culledKeyframes++
	}
	function prune(frameId: number) {
		const before = points.length
		points = points.filter(
			(p) => p.observations.length > 0 && (p.seen >= 2 || frameId - p.lastSeen < 30),
		)
		points.sort((a, b) => b.lastSeen - a.lastSeen || b.quality - a.quality)
		points = points.slice(0, MAP_LIMITS.landmarks)
		culledLandmarks += before - points.length
	}
	return {
		snapshot: () => lastSnapshot,
		update(
			frameId: number,
			timestamp: number,
			guess: Pose3,
			samples: StereoSample[],
			solve: Solver,
			weak = false,
		) {
			const start = performance.now()
			let pose = commit(guess),
				mapMatches = 0,
				trackingSource: MapSnapshot['trackingSource'] = 'stereo odometry'
			// Projection + appearance association; no global retrieval or relocalization.
			const candidates: {
				point: Landmark
				sample: StereoSample
				index: number
				distance: number
			}[] = []
			for (const point of points) {
				const p = stereoProjection(pose, point.position, k)
				if (!p || p[0] < 0 || p[1] < 0 || p[0] >= k.width || p[1] >= k.height) continue
				let best = Infinity,
					second = Infinity,
					index = -1
				for (let i = 0; i < samples.length; i++) {
					const s = samples[i]
					if (Math.hypot(s.pixel[0] - p[0], s.pixel[1] - p[1]) > 24) continue
					const d = descriptorDistance(point.descriptor, s.descriptor)
					if (d < best) {
						second = best
						best = d
						index = i
					} else second = Math.min(second, d)
				}
				if (index >= 0 && best < 0.25 && best < second * 0.8) {
					const s = samples[index],
						q = cameraPoint(pose, point.position)
					if (Math.abs(q[2] - s.point[2]) < Math.max(0.12, q[2] * 0.08))
						candidates.push({ point, sample: s, index, distance: best })
				}
			}
			candidates.sort((a, b) => a.distance - b.distance)
			const used = new Set<number>(),
				matches = candidates.filter((c) => {
					if (used.has(c.index)) return false
					used.add(c.index)
					return true
				})
			if (
				matches.length >= 8 &&
				coverage(
					matches.map((m) => m.sample.pixel),
					k,
				) >= 3
			) {
				const motion = solve(
					matches.map((m) => m.point.position),
					matches.map((m) => m.sample.pixel),
				)
				if (
					motion &&
					motion.inliers.length >= 8 &&
					motion.inliers.length / matches.length >= 0.5 &&
					motion.rmse < 1.5
				) {
					const candidate = integrate(identity(), motion.r, motion.t)
					const delta = Math.hypot(...candidate.position.map((v, i) => v - pose.position[i]))
					const agreement = candidate.rotation.reduce((s, v, i) => s + v * pose.rotation[i], 0)
					if (delta < 0.15 && agreement > 2.96) {
						pose = candidate
						mapMatches = motion.inliers.length
						trackingSource = 'local map'
					}
				}
			}
			const valid = matches.filter((m) => {
				const p = stereoProjection(pose, m.point.position, k)
				return p && Math.hypot(p[0] - m.sample.pixel[0], p[1] - m.sample.pixel[1]) < 2.5
			})
			for (const m of valid) {
				m.point.lastSeen = frameId
				m.point.seen++
				m.point.quality = Math.min(1, m.point.seen / 10)
			}
			const last = frames.at(-1),
				translation = last
					? Math.hypot(...pose.position.map((v, i) => v - last.pose.position[i]))
					: Infinity
			const angle = last
				? Math.acos(
						Math.max(
							-1,
							Math.min(
								1,
								(pose.rotation.reduce((s, v, i) => s + v * last.pose.rotation[i], 0) - 1) / 2,
							),
						),
					)
				: Infinity
			const overlap = valid.length / Math.max(1, samples.length)
			const insert =
				!last ||
				(timestamp - last.timestamp >= 0.5 &&
					(translation > 0.2 || angle > 0.12 || overlap < 0.35 || weak)) ||
				timestamp - (last?.timestamp ?? 0) > 2
			if (insert) {
				const f: MapKeyframe = {
					id: nextFrame++,
					frameId,
					timestamp,
					pose: structuredClone(pose),
					calibration: { ...k },
				}
				frames.push(f)
				const associated = new Map(valid.map((m) => [m.index, m.point]))
				for (let i = 0; i < samples.length; i++) {
					const s = samples[i]
					if (s.descriptor.length !== 49) continue
					let p = associated.get(i)
					const position = worldPoint(pose, s.point)
					// Fuse nearby duplicates only when appearance and metric depth agree.
					p ??= points.find(
						(p) =>
							Math.hypot(...p.position.map((v, j) => v - position[j])) < 0.045 &&
							descriptorDistance(p.descriptor, s.descriptor) < 0.15,
					)
					if (!p) {
						p = {
							id: nextPoint++,
							position,
							descriptor: [...s.descriptor],
							observations: [],
							seen: 1,
							lastSeen: frameId,
							quality: 0.1,
						}
						points.push(p)
					}
					if (!p.observations.some((o) => o.keyframeId === f.id))
						p.observations.push({
							keyframeId: f.id,
							landmarkId: p.id,
							pixel: [...s.pixel, s.pixel[0] - (k.fx * k.baseline) / s.point[2]],
						})
				}
				// Retain origin plus recent covisible frames. Redundant interior frames contribute little baseline.
				if (frames.length > 4) {
					const redundant = frames.slice(1, -2).find((a) => {
						const next = frames[frames.indexOf(a) + 1]
						const linked = points.filter((p) => p.observations.some((o) => o.keyframeId === a.id))
						return (
							Math.hypot(...a.pose.position.map((v, i) => v - next.pose.position[i])) < 0.12 &&
							linked.length > 0 &&
							linked.filter((p) => p.observations.length >= 3).length / linked.length > 0.9
						)
					})
					if (redundant) removeFrame(redundant.id)
				}
				while (frames.length > MAP_LIMITS.keyframes) removeFrame(frames[1].id)
				prune(frameId)
				const local = frames.slice(-MAP_LIMITS.localFrames),
					ids = new Set(local.map((f) => f.id))
				const active = points
					.filter((p) => p.observations.filter((o) => ids.has(o.keyframeId)).length >= 2)
					.sort((a, b) => b.quality - a.quality)
					.slice(0, MAP_LIMITS.localPoints)
				// Clone the whole transaction; guard against harming observations outside the active window.
				const proposedFrames = structuredClone(local),
					proposedPoints = structuredClone(active).map((p) => ({
						...p,
						observations: p.observations.filter((o) => ids.has(o.keyframeId)),
					}))
				if (!busy && local.length >= 2 && active.length >= 8) {
					busy = true
					schedule(
						{ graph: nextFrame, frames: proposedFrames, points: proposedPoints },
						(result) => {
							completed = result
						},
					)
					pose = commit(pose)
				}
				// Discard inconsistent observations, then orphan landmarks.
				for (const p of points) {
					p.observations = p.observations.filter((o) => {
						const f = frames.find((f) => f.id === o.keyframeId)
						if (!f) return false
						const uv = stereoProjection(f.pose, p.position, k)
						return uv && Math.hypot(...uv.map((v, i) => v - o.pixel[i])) < 6
					})
				}
				prune(frameId)
			}
			lastSnapshot = {
				revision: ++revision,
				optimizationPending: busy,
				bundleRevision,
				frameId,
				pose: structuredClone(pose),
				landmarks: structuredClone(points),
				keyframes: structuredClone(frames),
				mapMatches,
				trackingSource,
				culledLandmarks,
				culledKeyframes,
				bundle: lastBundle ? { ...lastBundle } : null,
				updateMs: performance.now() - start,
			}
			return lastSnapshot
		},
	}
}
