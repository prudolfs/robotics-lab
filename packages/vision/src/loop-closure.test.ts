import { expect, it } from 'vitest'
import { identity } from './geometry'
import { appearanceMatches, createLoopClosure, LOOP_LIMITS, verifyRevisit } from './loop-closure'
import type { StereoSample } from './mapping'
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
const samples: StereoSample[] = Array.from({ length: 36 }, (_, i) => ({
	point: [((i % 6) - 2.5) * 0.2, (Math.floor(i / 6) - 2.5) * 0.18, 2 + (i % 4) * 0.3] as V3,
	pixel: [60 + (i % 6) * 90, 50 + Math.floor(i / 6) * 70],
	descriptor: Array.from({ length: 49 }, (_, j) => (i === j ? 1 : 0)),
}))
const solve = () => ({
	r: identity().rotation,
	t: [0, 0, 0] as V3,
	inliers: samples.map((_, i) => i),
	rmse: 0,
})
it('verifies distinctive distributed nonplanar stereo geometry and rejects lookalike geometry', () => {
	expect(appearanceMatches(samples, samples)).toHaveLength(36)
	expect(verifyRevisit(samples, samples, k, solve).measurement).toEqual(identity())
	const falsePlace = samples.map((s, i) => ({ ...s, point: samples[(i * 5 + 7) % 36].point }))
	expect(verifyRevisit(samples, falsePlace, k, solve).measurement).toBeNull()
	const plane = samples.map((s) => ({ ...s, point: [s.point[0], s.point[1], 3] as V3 }))
	expect(verifyRevisit(plane, plane, k, solve).reason).toContain('planar')
})
it('temporal exclusion prevents closure even with identical appearances and nearby supplied poses', () => {
	const loops = createLoopClosure(k)
	for (let id = 0; id < 30; id++)
		loops.add(
			{ id, frameId: id, timestamp: id * 0.1, pose: identity(), calibration: k },
			samples,
			() => {
				throw Error('Recent places must not be verified')
			},
		)
	expect(loops.snapshot().events).toEqual([])
	expect(loops.snapshot().corrections).toBe(0)
})
it('keeps the appearance database, pose graph and observation archive bounded independently of the active map', () => {
	const loops = createLoopClosure(k, false)
	for (let id = 0; id < 200; id++) {
		const pose = { ...identity(), position: [id * 0.1, 0, 0] as V3 }
		loops.add({ id, frameId: id, timestamp: id, pose, calibration: k }, samples, solve)
		loops.record(id, pose)
	}
	const state = loops.snapshot()
	expect(state.database).toBe(LOOP_LIMITS.places)
	expect(state.edges).toBe(LOOP_LIMITS.places - 1)
	expect(state.graph[0].id).toBe(0)
	expect(state.trajectory).toHaveLength(200)
	expect(state.events).toEqual([])
})
it('publishes candidate, verified and applied stages only after repeated supported geometry', () => {
	const loops = createLoopClosure(k)
	expect(loops.needsConfirmation(0)).toBe(false)
	for (let id = 0; id < 28; id++) {
		const pose = { ...identity(), position: [id * 0.01, 0, 0] as V3 }
		loops.add({ id, frameId: id, timestamp: id, pose, calibration: k }, samples, solve)
		loops.record(id, pose)
		if (id === 25) {
			expect(loops.snapshot().corrections).toBe(0)
			expect(loops.needsConfirmation(25.5)).toBe(true)
			expect(loops.needsConfirmation(28)).toBe(false)
		}
	}
	const state = loops.snapshot()
	expect(loops.needsConfirmation(27.5)).toBe(false)
	expect(state.corrections).toBeGreaterThan(0)
	expect(state.events.some((e) => e.kind === 'candidate')).toBe(true)
	expect(state.events.some((e) => e.kind === 'verified')).toBe(true)
	expect(state.events.some((e) => e.kind === 'applied')).toBe(true)
	expect(state.optimization?.after).toBeLessThan(state.optimization?.before ?? 0)
	expect(state.before.length).toBeGreaterThan(0)
	expect(state.graph[0].pose).toEqual(identity())
})
