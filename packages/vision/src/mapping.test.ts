import { describe, expect, it } from 'vitest'
import {
	bundleCost,
	type Landmark,
	type MapKeyframe,
	refineBundle,
	stereoProjection,
} from './bundle'
import { identity } from './geometry'
import {
	type BundleJob,
	type BundleResult,
	createLocalMap,
	MAP_LIMITS,
	runBundleJob,
} from './mapping'
import type { Calibration, V3 } from './types'

const k: Calibration = {
	width: 640,
	height: 480,
	fx: 480,
	fy: 480,
	cx: 320,
	cy: 240,
	baseline: 0.12,
}
function required<T>(value: T | null | undefined): T {
	if (value == null) throw Error('Missing fixture value')
	return value
}
function fixture() {
	const frames: MapKeyframe[] = Array.from({ length: 4 }, (_, i) => ({
		id: i,
		frameId: i * 10,
		timestamp: i,
		calibration: k,
		pose: { ...identity(), position: [i * 0.15, 0, 0] },
	}))
	const points: Landmark[] = Array.from({ length: 36 }, (_, i) => {
		const position: V3 = [
			((i % 6) - 2.5) * 0.17,
			(Math.floor(i / 6) - 2.5) * 0.16,
			2 + (i % 4) * 0.25,
		]
		return {
			id: i,
			position,
			descriptor: [],
			seen: 4,
			lastSeen: 30,
			quality: 1,
			observations: frames.map((f) => ({
				landmarkId: i,
				keyframeId: f.id,
				pixel: required(stereoProjection(f.pose, position, k)),
			})),
		}
	})
	for (const p of points) p.position = p.position.map((v, i) => v + (i === 2 ? 0.035 : 0.008)) as V3
	for (const f of frames.slice(1)) f.pose.position[1] += 0.012
	return { frames, points }
}
describe('bounded local stereo bundle adjustment', () => {
	it('reduces reprojection error while fixing the reference pose and metric stereo scale', () => {
		const { frames, points } = fixture(),
			anchor = structuredClone(frames[0]),
			before = bundleCost(frames, points)
		const result = refineBundle(frames, points)
		expect(result.accepted).toBe(true)
		expect(bundleCost(frames, points)).toBeLessThan(before * 0.3)
		expect(frames[0]).toEqual(anchor)
		expect(result.iterations).toBeLessThanOrEqual(4)
	})
	it('robustly refines with an outlier and rejects unsupported/singular updates without mutating data', () => {
		const { frames, points } = fixture()
		points[0].observations[1].pixel[0] += 40
		const before = bundleCost(frames, points)
		refineBundle(frames, points)
		expect(bundleCost(frames, points)).toBeLessThan(before)
		const single = fixture()
		single.frames = single.frames.slice(0, 1)
		const saved = structuredClone(single)
		expect(refineBundle(single.frames, single.points).accepted).toBe(false)
		expect(single).toEqual(saved)
		const degenerate = fixture()
		for (const f of degenerate.frames) f.calibration = { ...k, fx: 0, fy: 0 }
		const original = structuredClone(degenerate)
		expect(refineBundle(degenerate.frames, degenerate.points).accepted).toBe(false)
		expect(degenerate).toEqual(original)
	})
	it('rejects invalid depth without publishing poisoned coordinates', () => {
		const { frames, points } = fixture()
		points[0].position[2] = -1
		const saved = structuredClone({ frames, points })
		expect(refineBundle(frames, points).accepted).toBe(false)
		expect({ frames, points }).toEqual(saved)
	})
})
it('keeps bounded, linked snapshots with monotonic IDs and no retroactive mutation', () => {
	const map = createLocalMap(k),
		d = Array(49).fill(0)
	d[0] = 1
	const samples = Array.from({ length: 100 }, (_, i) => ({
		pixel: [50 + (i % 10) * 53, 40 + Math.floor(i / 10) * 40] as [number, number],
		point: [((i % 10) - 5) * 0.2, (Math.floor(i / 10) - 5) * 0.18, 3] as V3,
		descriptor: d.map((v, j) => (j === i % 49 ? 1 : v * 0.1)),
	}))
	const first = map.update(0, 0, identity(), samples, () => null),
		saved = structuredClone(first)
	for (let i = 1; i < 30; i++)
		map.update(i * 10, i, { ...identity(), position: [i * 0.3, 0, 0] }, samples, () => null)
	const snapshot = required(map.snapshot())
	expect(first).toEqual(saved)
	expect(snapshot.revision).toBe(30)
	expect(snapshot.keyframes.length).toBeLessThanOrEqual(MAP_LIMITS.keyframes)
	expect(snapshot.landmarks.length).toBeLessThanOrEqual(MAP_LIMITS.landmarks)
	expect(snapshot.culledKeyframes).toBeGreaterThan(0)
	expect(snapshot.culledLandmarks).toBeGreaterThan(0)
	const frameIds = new Set(snapshot.keyframes.map((f) => f.id))
	expect(frameIds.has(0)).toBe(true)
	for (const p of snapshot.landmarks) {
		expect(p.observations.length).toBeGreaterThan(0)
		expect(new Set(p.observations.map((o) => o.keyframeId)).size).toBe(p.observations.length)
		for (const o of p.observations) {
			expect(frameIds.has(o.keyframeId)).toBe(true)
			expect(o.landmarkId).toBe(p.id)
		}
	}
})

it('reuses image-associated landmark IDs and publishes pose and map in the same revision', () => {
	const map = createLocalMap(k),
		pose = identity()
	const samples = Array.from({ length: 24 }, (_, i) => {
		const point: V3 = [((i % 6) - 2.5) * 0.4, (Math.floor(i / 6) - 1.5) * 0.4, 3]
		const p = required(stereoProjection(pose, point, k))
		return {
			point,
			pixel: [p[0], p[1]] as [number, number],
			descriptor: Array.from({ length: 49 }, (_, j) => (j === i ? 1 : 0)),
		}
	})
	const first = map.update(0, 0, pose, samples, () => null),
		ids = first.landmarks.map((p) => p.id)
	const next = map.update(30, 3, pose, samples, () => ({
		r: pose.rotation,
		t: [0, 0, 0],
		inliers: samples.map((_, i) => i),
		rmse: 0,
	}))
	expect(next.trackingSource).toBe('local map')
	expect(next.landmarks.map((p) => p.id)).toEqual(ids)
	expect(next.keyframes.length).toBe(2)
	expect(next.landmarks.every((p) => p.observations.length === 2)).toBe(true)
	expect(next.pose).toEqual(next.keyframes[1].pose)
	expect(first.landmarks.every((p) => p.observations.length === 1)).toBe(true)
})

it('publishes asynchronous refinement only with the next coherent frame and rejects stale jobs', () => {
	const jobs: { job: BundleJob; done: (r: BundleResult) => void }[] = []
	const map = createLocalMap(k, (job, done) => jobs.push({ job, done }))
	const samples = Array.from({ length: 24 }, (_, i) => {
		const point: V3 = [((i % 6) - 2.5) * 0.4, (Math.floor(i / 6) - 1.5) * 0.4, 3],
			uv = stereoProjection(identity(), point, k)
		if (!uv) throw Error('fixture depth')
		return {
			point,
			pixel: [uv[0], uv[1]] as [number, number],
			descriptor: Array.from({ length: 49 }, (_, j) => (j === i ? 1 : 0)),
		}
	})
	map.update(0, 0, identity(), samples, () => null)
	const second = map.update(30, 3, { ...identity(), position: [0.01, 0, 0] }, samples, () => null)
	expect(second.optimizationPending).toBe(true)
	expect(jobs.length).toBe(1)
	const saved = structuredClone(second),
		result = runBundleJob(jobs[0].job)
	expect(result.report.accepted).toBe(true)
	jobs[0].done(result)
	expect(map.snapshot()).toEqual(saved)
	const committed = map.update(31, 3.1, second.pose, samples, () => null)
	expect(committed.bundleRevision).toBe(1)
	expect(committed.optimizationPending).toBe(false)
	expect(committed.bundle?.accepted).toBe(true)
	expect(committed.keyframes[0].pose).toEqual(identity())
	map.update(60, 6, committed.pose, samples, () => null)
	map.update(90, 9, committed.pose, samples, () => null)
	expect(jobs.length).toBe(2)
	jobs[1].done(runBundleJob(jobs[1].job))
	const stale = map.update(91, 9.1, committed.pose, samples, () => null)
	expect(stale.bundle?.accepted).toBe(false)
	expect(stale.bundle?.reason).toContain('Stale')
})
it('flushes a completed refinement while idle without inventing a frame or scheduling endlessly', () => {
	const jobs: { job: BundleJob; done: (r: BundleResult) => void }[] = []
	const map = createLocalMap(k, (job, done) => jobs.push({ job, done }))
	const samples = Array.from({ length: 24 }, (_, i) => {
		const point: V3 = [((i % 6) - 2.5) * 0.4, (Math.floor(i / 6) - 1.5) * 0.4, 3],
			p = required(stereoProjection(identity(), point, k))
		return {
			point,
			pixel: [p[0], p[1]] as [number, number],
			descriptor: Array.from({ length: 49 }, (_, j) => (j === i ? 1 : 0)),
		}
	})
	map.update(0, 0, identity(), samples, () => null)
	const old = map.update(30, 3, { ...identity(), position: [0.01, 0, 0] }, samples, () => null),
		saved = structuredClone(old)
	jobs[0].done(runBundleJob(jobs[0].job))
	const revised = required(map.flush())
	expect(revised.frameId).toBe(30)
	expect(revised.revision).toBeGreaterThan(old.revision)
	expect(revised.bundle?.accepted).toBe(true)
	expect(revised.loop.trajectory.map((f) => f.frameId)).toEqual([0, 30])
	expect(old).toEqual(saved)
	expect(map.flush()).toBeUndefined()
	expect(jobs).toHaveLength(1)
})
