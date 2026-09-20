import type { MapKeyframe } from './bundle'
import { coverage, identity, integrate, rotate } from './geometry'
import type { StereoSample } from './mapping'
import {
	compose,
	type GraphEdge,
	type GraphJob,
	type GraphNode,
	type GraphResult,
	type GraphScheduler,
	optimizeGraph,
	relative,
	rotationVector,
} from './pose-graph'
import type { Calibration, Pixel, Pose3, V3 } from './types'
export type LoopSolver = (
	points: V3[],
	pixels: Pixel[],
) => { r: number[]; t: V3; inliers: number[]; rmse: number } | null
export type LoopEvent = {
	id: number
	frameId: number
	kind: 'candidate' | 'verified' | 'rejected' | 'applied'
	candidate: number
	score: number
	matches: number
	inliers: number
	residual: number | null
	reason: string
}
type Place = GraphNode & { timestamp: number; samples: StereoSample[]; signature: number[] }
export type LoopTrajectory = { frameId: number; pose: Pose3 }
export type LoopSnapshot = {
	enabled: boolean
	database: number
	edges: number
	pending: boolean
	corrections: number
	events: LoopEvent[]
	trajectory: LoopTrajectory[]
	before: LoopTrajectory[]
	graph: GraphNode[]
	optimization: { before: number; after: number; iterations: number; milliseconds: number } | null
}
export type LoopCorrection = { before: GraphNode[]; after: GraphNode[] }
export const LOOP_LIMITS = {
	places: 160,
	samples: 240,
	events: 48,
	trajectory: 1200,
	loops: 8,
} as const
function signature(samples: StereoSample[]) {
	const h = Array(64).fill(0)
	for (const s of samples) {
		let bin = 0
		for (let b = 0; b < 6; b++) if (s.descriptor[b * 8] > 0) bin |= 1 << b
		h[bin]++
	}
	const n = Math.hypot(...h) || 1
	return h.map((v) => v / n)
}
const distance = (a: number[], b: number[]) => 1 - a.reduce((sum, v, i) => sum + v * b[i], 0)
export function appearanceMatches(a: StereoSample[], b: StereoSample[]) {
	const forward = a.map((s) => {
		let first = Infinity,
			second = Infinity,
			index = -1
		for (let j = 0; j < b.length; j++) {
			const d = distance(s.descriptor, b[j].descriptor)
			if (d < first) {
				second = first
				first = d
				index = j
			} else second = Math.min(second, d)
		}
		return { index, d: first, ok: first < 0.22 && first < second * 0.75 }
	})
	return forward.flatMap((f, i) => {
		if (!f.ok) return []
		let best = Infinity,
			reverse = -1
		for (let j = 0; j < a.length; j++) {
			const d = distance(a[j].descriptor, b[f.index].descriptor)
			if (d < best) {
				best = d
				reverse = j
			}
		}
		return reverse === i ? [{ a: i, b: f.index }] : []
	})
}
export function verifyRevisit(
	a: StereoSample[],
	b: StereoSample[],
	k: Calibration,
	solve: LoopSolver,
) {
	const matches = appearanceMatches(a, b),
		failed = (reason: string) => ({
			matches: matches.length,
			inliers: 0,
			residual: null as number | null,
			measurement: null as Pose3 | null,
			reason,
		})
	if (matches.length < 20) return failed('Too few distinctive mutual descriptor matches')
	const motion = solve(
		matches.map((m) => a[m.a].point),
		matches.map((m) => b[m.b].pixel),
	)
	if (!motion || motion.rmse > 1.5) return failed('Forward geometric fit failed')
	const inliers = motion.inliers.filter((i) => {
		const m = matches[i],
			q = rotate(motion.r, a[m.a].point).map((v, j) => v + motion.t[j])
		return Math.hypot(...q.map((v, j) => v - b[m.b].point[j])) < 0.04 + 0.03 * b[m.b].point[2]
	})
	if (
		inliers.length < 18 ||
		inliers.length / matches.length < 0.65 ||
		coverage(
			inliers.map((i) => b[matches[i].b].pixel),
			k,
		) < 6
	)
		return failed('Insufficient spatially distributed 3D support')
	const depths = inliers.map((i) => a[matches[i].a].point[2])
	if (Math.max(...depths) - Math.min(...depths) < 0.35) return failed('Ambiguous planar geometry')
	const back = solve(
		inliers.map((i) => b[matches[i].b].point),
		inliers.map((i) => a[matches[i].a].pixel),
	)
	if (!back || back.inliers.length < 18 || back.rmse > 1.5)
		return failed('Reverse geometric fit failed')
	const measurement = integrate(identity(), motion.r, motion.t),
		reverse = integrate(identity(), back.r, back.t),
		cycle = compose(measurement, reverse)
	if (Math.hypot(...cycle.position) > 0.08 || Math.hypot(...rotationVector(cycle.rotation)) > 0.04)
		return failed('Forward/reverse transform disagreement')
	return {
		matches: matches.length,
		inliers: inliers.length,
		residual: motion.rmse,
		measurement,
		reason: 'Mutual appearance, stereo 3D and bidirectional PnP verified',
	}
}
export function createLoopClosure(
	k: Calibration,
	enabled = true,
	schedule: GraphScheduler = (job, done) => done(optimizeGraph(job)),
) {
	let places: Place[] = [],
		edges: GraphEdge[] = [],
		events: LoopEvent[] = [],
		serial = 0,
		version = 0,
		corrections = 0,
		busy = false,
		completed: GraphResult | null = null,
		proposal: {
			candidate: number
			frameId: number
			score: number
			matches: number
			inliers: number
			residual: number | null
		} | null = null,
		lastVerified = -999,
		lastVerifiedAt = -999,
		lastAppliedAt = -999
	let history: { frameId: number; owner: number; offset: Pose3 }[] = [],
		beforeTrail: LoopTrajectory[] = [],
		optimization: LoopSnapshot['optimization'] = null
	const event = (
		kind: LoopEvent['kind'],
		frameId: number,
		candidate: number,
		score: number,
		matches: number,
		inliers: number,
		residual: number | null,
		reason: string,
	) => {
		events = [
			...events.slice(-(LOOP_LIMITS.events - 1)),
			{ id: serial++, kind, frameId, candidate, score, matches, inliers, residual, reason },
		]
	}
	const trajectory = () =>
		history.flatMap((h) => {
			const p = places.find((p) => p.id === h.owner)
			return p ? [{ frameId: h.frameId, pose: compose(p.pose, h.offset) }] : []
		})
	function poll(): LoopCorrection | null {
		if (!completed || !proposal) return null
		const result = completed,
			p = proposal
		completed = null
		proposal = null
		busy = false
		if (
			result.version !== version ||
			!result.accepted ||
			!Number.isFinite(result.after) ||
			result.after >= result.before
		) {
			event(
				'rejected',
				p.frameId,
				p.candidate,
				p.score,
				p.matches,
				p.inliers,
				p.residual,
				'Stale or non-improving pose graph',
			)
			return null
		}
		const old = places.map(({ id, frameId, pose }) => ({
			id,
			frameId,
			pose: structuredClone(pose),
		}))
		beforeTrail = trajectory()
		for (const n of result.nodes) {
			const place = places.find((p) => p.id === n.id)
			if (place) place.pose = n.pose
		}
		edges = result.edges
		corrections++
		lastAppliedAt = places.at(-1)?.timestamp ?? 0
		optimization = {
			before: result.before,
			after: result.after,
			iterations: result.iterations,
			milliseconds: result.milliseconds,
		}
		event(
			'applied',
			p.frameId,
			p.candidate,
			p.score,
			p.matches,
			p.inliers,
			p.residual,
			'Verified loop optimized and committed',
		)
		return {
			before: old,
			after: places.map(({ id, frameId, pose }) => ({ id, frameId, pose: structuredClone(pose) })),
		}
	}
	return {
		sync(frames: MapKeyframe[]) {
			for (const f of frames) {
				const p = places.find((p) => p.id === f.id)
				if (p) p.pose = structuredClone(f.pose)
			}
		},
		poll,
		ready: () => completed !== null,
		// A short-lived verified hypothesis needs a new view even if local tracking
		// still has enough overlap to postpone its next keyframe.
		needsConfirmation: (timestamp: number) =>
			enabled && !busy && lastVerifiedAt > lastAppliedAt && timestamp - lastVerifiedAt < 3,
		add(f: MapKeyframe, input: StereoSample[], solve: LoopSolver) {
			const available = input
				.map((s) => ({ ...s, descriptor: s.appearance ?? s.descriptor }))
				.filter((s) => s.descriptor.length === 49)
			const samples = Array.from(
					{ length: Math.min(LOOP_LIMITS.samples, available.length) },
					(_, i) =>
						available[
							Math.floor((i * available.length) / Math.min(LOOP_LIMITS.samples, available.length))
						],
				),
				last = places.at(-1),
				place: Place = {
					id: f.id,
					frameId: f.frameId,
					timestamp: f.timestamp,
					pose: structuredClone(f.pose),
					samples: structuredClone(samples),
					signature: signature(samples),
				}
			if (last)
				edges.push({
					from: last.id,
					to: place.id,
					measurement: relative(last.pose, place.pose),
					kind: 'odometry',
				})
			places.push(place)
			version++
			if (places.length > LOOP_LIMITS.places) {
				const protectedIds = new Set(
					edges.filter((e) => e.kind === 'loop').flatMap((e) => [e.from, e.to]),
				)
				const at = places.findIndex(
					(p, i) => i > 0 && i < places.length - 1 && !protectedIds.has(p.id),
				)
				if (at > 0) {
					const removed = places[at],
						a = places[at - 1],
						b = places[at + 1],
						ea = edges.find((e) => e.from === a.id && e.to === removed.id),
						eb = edges.find((e) => e.from === removed.id && e.to === b.id)
					edges = edges.filter((e) => e.from !== removed.id && e.to !== removed.id)
					if (ea && eb)
						edges.push({
							from: a.id,
							to: b.id,
							measurement: compose(ea.measurement, eb.measurement),
							kind: 'odometry',
						})
					for (const h of history)
						if (h.owner === removed.id) {
							h.offset = relative(a.pose, compose(removed.pose, h.offset))
							h.owner = a.id
						}
					places.splice(at, 1)
				}
			}
			if (
				!enabled ||
				busy ||
				f.timestamp - lastAppliedAt < 8 ||
				edges.filter((e) => e.kind === 'loop').length >= LOOP_LIMITS.loops
			)
				return null
			const candidates = places
				.filter((p) => f.timestamp - p.timestamp >= 20 && f.id - p.id >= 25)
				.map((p) => ({ p, score: p.signature.reduce((s, v, i) => s + v * place.signature[i], 0) }))
				.filter((c) => c.score > 0.65)
				.sort((a, b) => b.score - a.score)
				.slice(0, 3)
			for (const { p, score } of candidates) {
				event(
					'candidate',
					f.frameId,
					p.id,
					score,
					0,
					0,
					null,
					'Appearance retrieval; no pose-distance trigger',
				)
				const verified = verifyRevisit(p.samples, samples, k, solve)
				if (!verified.measurement) {
					event(
						'rejected',
						f.frameId,
						p.id,
						score,
						verified.matches,
						verified.inliers,
						verified.residual,
						verified.reason,
					)
					continue
				}
				event(
					'verified',
					f.frameId,
					p.id,
					score,
					verified.matches,
					verified.inliers,
					verified.residual,
					verified.reason,
				)
				const consistent = Math.abs(lastVerified - p.id) <= 4 && f.timestamp - lastVerifiedAt < 3
				lastVerified = p.id
				lastVerifiedAt = f.timestamp
				if (!consistent && verified.inliers < 48) break
				const loop: GraphEdge = {
					from: p.id,
					to: f.id,
					measurement: verified.measurement,
					kind: 'loop',
				}
				proposal = {
					candidate: p.id,
					frameId: f.frameId,
					score,
					matches: verified.matches,
					inliers: verified.inliers,
					residual: verified.residual,
				}
				busy = true
				const job: GraphJob = {
					version,
					nodes: places.map(({ id, frameId, pose }) => ({
						id,
						frameId,
						pose: structuredClone(pose),
					})),
					edges: structuredClone([...edges, loop]),
				}
				schedule(job, (result) => {
					completed = result
				})
				return poll()
			}
			return null
		},
		record(frameId: number, pose: Pose3) {
			const owner = places.at(-1)
			if (owner)
				history = [
					...history.filter((h) => h.frameId !== frameId).slice(-(LOOP_LIMITS.trajectory - 1)),
					{ frameId, owner: owner.id, offset: relative(owner.pose, pose) },
				]
		},
		snapshot(): LoopSnapshot {
			return {
				enabled,
				database: places.length,
				edges: edges.length,
				pending: busy,
				corrections,
				events: structuredClone(events),
				trajectory: trajectory(),
				before: structuredClone(beforeTrail),
				graph: places.map(({ id, frameId, pose }) => ({
					id,
					frameId,
					pose: structuredClone(pose),
				})),
				optimization,
			}
		},
	}
}
