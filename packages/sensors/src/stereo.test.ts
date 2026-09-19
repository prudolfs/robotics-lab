import { describe, expect, it } from 'vitest'
import {
	cameraCenter,
	drawObservations,
	dropped,
	flipRows,
	frameSeed,
	occluded,
	pixelNoise,
	processFrame,
	project,
	type StereoCalibration,
	type StereoFrame,
	syntheticObservations,
	toOptical,
	unproject,
	type Vec3,
} from './stereo'

const k: StereoCalibration = {
	width: 640,
	height: 480,
	fx: 480,
	fy: 480,
	cx: 320,
	cy: 240,
	baseline: 0.12,
	captureHz: 10,
}
const mounts: [Vec3, Vec3] = [
	[0.16, 0.06, 0.45],
	[0.16, -0.06, 0.45],
]
describe('calibrated stereo', () => {
	it('round-trips optical points and rejects invisible depths/pixels', () => {
		for (const p of [
			[0.2, 0.1, 2],
			[-1, -0.2, 5],
			[0, 0, 0.1],
		] as Vec3[]) {
			const uv = project(p, k)
			if (!uv) throw Error('Expected visible point')
			unproject(uv, p[2], k).forEach((v, i) => {
				expect(v).toBeCloseTo(p[i], 10)
			})
		}
		expect(project([0, 0, -1], k)).toBeNull()
		expect(project([0, 0, 31], k)).toBeNull()
		expect(project([10, 0, 1], k)).toBeNull()
	})
	it('preserves rectified rows and positive metric disparity at rotated robot poses', () => {
		for (const heading of [0, Math.PI / 2, -1.7]) {
			const pose = { x: 1, y: 2, heading },
				c = cameraCenter(pose, mounts[0])
			const point: Vec3 = [c[0] + 2 * Math.cos(heading), c[1] + 2 * Math.sin(heading), 0.6]
			const l = project(toOptical(point, pose, mounts[0]), k),
				r = project(toOptical(point, pose, mounts[1]), k)
			if (!l || !r) throw Error('Expected stereo visibility')
			expect(l[1]).toBeCloseTo(r[1], 9)
			expect(l[0] - r[0]).toBeCloseTo((k.fx * k.baseline) / 2, 9)
		}
	})
	it('culls occluded observations for either eye without hiding the supporting surface', () => {
		const box = { min: [1, -0.3, 0] as Vec3, max: [1.2, 0.3, 1] as Vec3 }
		expect(occluded([0, 0, 0.4], [2, 0, 0.4], [box])).toBe(true)
		expect(occluded([0, 0, 0.4], [1, 0, 0.4], [box])).toBe(false)
		const observations = syntheticObservations(
			[
				[2, 0, 0.4],
				[2, 1, 0.4],
				[-2, 0, 0.4],
			],
			[box],
			{ x: 0, y: 0, heading: 0 },
			mounts,
			k,
			1,
		)
		expect(observations.map((o) => o.id)).toEqual([1])
	})
	it('seeds bounded observation jitter, pixel noise and frame dropout independently', () => {
		const points: Vec3[] = [
				[2, 0, 0.45],
				[3, 0.2, 0.6],
			],
			pose = { x: 0, y: 0, heading: 0 }
		expect(syntheticObservations(points, [], pose, mounts, k, 42, 2, 0.2)).toEqual(
			syntheticObservations(points, [], pose, mounts, k, 42, 2, 0.2),
		)
		const a = new Uint8Array(400).fill(128),
			b = a.slice(),
			c = a.slice()
		pixelNoise(a, 24, frameSeed(42, 7))
		pixelNoise(b, 24, frameSeed(42, 7))
		pixelNoise(c, 24, frameSeed(42, 8))
		expect(a).toEqual(b)
		expect(a).not.toEqual(c)
		expect(a[3]).toBe(128)
		expect(dropped(42, 1, 0)).toBe(false)
		expect(dropped(42, 1, 1)).toBe(true)
		expect(Array.from({ length: 20 }, (_, i) => dropped(42, i, 0.5))).toEqual(
			Array.from({ length: 20 }, (_, i) => dropped(42, i, 0.5)),
		)
	})
	it('flips readback rows once and produces replay-stable grayscale pixels', () => {
		const bytes = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255])
		flipRows(bytes, 1, 2)
		expect([...bytes.slice(0, 4)]).toEqual([0, 255, 0, 255])
		flipRows(bytes, 1, 2)
		const f: StereoFrame = {
			generation: 0,
			frameId: 0,
			timestamp: 0,
			kind: 'rendered',
			calibration: { ...k, width: 1, height: 2 },
			left: bytes.buffer.slice(0),
			right: bytes.buffer.slice(0),
		}
		const result = processFrame(f)
		expect([...new Uint8Array(result.left).slice(0, 4)]).toEqual([77, 77, 77, 255])
		expect(processFrame(result).checksum).toBe(result.checksum)
	})
	it('runs an exact lockstep synthetic fixture without browser APIs or a renderer', () => {
		const checksums = []
		for (let id = 0; id < 5; id++) {
			const frame: StereoFrame = {
				generation: 0,
				frameId: id,
				timestamp: id / 10,
				kind: 'synthetic',
				calibration: k,
				left: new ArrayBuffer(640 * 480 * 4),
				right: new ArrayBuffer(640 * 480 * 4),
				observations: syntheticObservations(
					[
						[2, 0, 0.45],
						[3, 0.2, 0.6],
					],
					[],
					{ x: id * 0.03, y: 0, heading: 0 },
					mounts,
					k,
					42,
				),
			}
			drawObservations(frame)
			checksums.push(processFrame(frame).checksum)
		}
		expect(new Set(checksums).size).toBeGreaterThan(1)
	})
})
