import { describe, it, expect } from 'vitest'
import {
	worldToScene,
	sceneToWorld,
	legacyToWorld,
	worldToLegacy,
	worldToBlender,
	blenderToGltf,
	opticalToRobot,
	robotToOptical,
	project,
	triangulate,
	estimatePose,
	transform,
	type V3,
} from './geometry'
const cross = (a: V3, b: V3): V3 => [
	a[1] * b[2] - a[2] * b[1],
	a[2] * b[0] - a[0] * b[2],
	a[0] * b[1] - a[1] * b[0],
]
describe('coordinate contract', () => {
	it('preserves handedness for rigid 3D adapters', () => {
		for (const fn of [worldToScene, opticalToRobot, worldToBlender, blenderToGltf]) {
			const result = cross(fn([1, 0, 0]), fn([0, 1, 0]))
			fn([0, 0, 1]).forEach((v, i) => expect(result[i]).toBeCloseTo(v, 12))
		}
	})
	it('round trips all axes and preserves legacy scene placement', () => {
		for (const p of [
			[1, 2, 3],
			[-4, 0.5, 0],
		] as V3[]) {
			expect(sceneToWorld(worldToScene(p))).toEqual(p)
			expect(robotToOptical(opticalToRobot(p))).toEqual(p)
			expect(worldToLegacy(legacyToWorld(...p))).toEqual(p)
			expect(worldToScene(legacyToWorld(...p))).toEqual([p[0], p[2], p[1]])
			expect(blenderToGltf(worldToBlender(p))).toEqual(worldToScene(p))
		}
	})
	it('recovers stereo metric depth and rejects zero/negative disparity', () => {
		const p: V3 = [0.3, -0.2, 4],
			uv = project(p),
			right = project([p[0] - 0.12, p[1], p[2]])
		triangulate(...uv, right[0])!.forEach((v, i) => expect(v).toBeCloseTo(p[i], 10))
		expect(triangulate(100, 100, 100)).toBeNull()
		expect(triangulate(100, 100, 101)).toBeNull()
	})
	it('recovers six degree pose from noncoplanar points', () => {
		const pts: V3[] = Array.from({ length: 40 }, (_, i) => [
			((i % 5) - 2) * 0.2,
			((Math.floor(i / 5) % 4) - 1.5) * 0.2,
			2 + (i % 7) * 0.3,
		])
		const truth = [0.01, -0.015, 0.005, 0.03, -0.01, -0.08]
		const result = estimatePose(
			pts,
			pts.map((p) => project(transform(p, truth))),
		)
		result.pose.forEach((v, i) => expect(v).toBeCloseTo(truth[i], 6))
		expect(result.rms).toBeLessThan(1e-5)
	})
	it('rejects insufficient observations', () =>
		expect(() => estimatePose([], [])).toThrow('Insufficient'))
})
