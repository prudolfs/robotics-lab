import { identity, type OdometryResult } from '@robotics-lab/vision'
import { expect, it } from 'vitest'
import { createVisualEvaluation } from './visual'

const result = (frameId: number, z: number): OdometryResult => ({
	frameId,
	timestamp: frameId / 10,
	referenceFrameId: 0,
	acceptedFrameId: frameId,
	pose: { ...identity(), position: [0, 0, z] },
	status: 'tracking',
	reason: 'fixture',
	detected: 30,
	stereo: 30,
	matches: 30,
	inliers: 30,
	rmse: 0,
	coverage: 8,
	overlays: [],
	nativeObjects: 0,
	peakNativeObjects: 0,
	wasmHeapBytes: 0,
})
it('replaces revised pose error without inventing another image sample and ignores old revisions after reset', () => {
	const evaluation = createVisualEvaluation()
	evaluation.accept(result(0, 0), { x: 0, y: 0, heading: 0 })
	evaluation.accept(result(1, 0.1), { x: 0.1, y: 0, heading: 0 })
	evaluation.revise(result(1, 0.2))
	expect(evaluation.snapshot().samples).toBe(2)
	expect(evaluation.snapshot().trail).toHaveLength(2)
	expect(evaluation.snapshot().error).toBeCloseTo(0.1)
	evaluation.revise(result(1, 0.3))
	expect(evaluation.snapshot().samples).toBe(2)
	expect(evaluation.snapshot().rms).toBeCloseTo(Math.sqrt(0.04 / 2))
	evaluation.reset()
	evaluation.revise(result(1, 10))
	expect(evaluation.snapshot().samples).toBe(0)
	expect(evaluation.snapshot().error).toBeNull()
})
