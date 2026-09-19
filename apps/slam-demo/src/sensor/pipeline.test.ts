import { type ProcessedFrame, processFrame, type StereoFrame } from '@robotics-lab/sensors'
import { expect, it } from 'vitest'
import { createController } from '../sim/controller'
import { FramePipeline, type WorkerPort } from './pipeline'
import { cloneFrame, decodeRecording, encodeRecording } from './recording'

function frame(frameId = 0, generation = 0): StereoFrame {
	return {
		frameId,
		generation,
		timestamp: frameId / 10,
		kind: 'rendered',
		calibration: { width: 2, height: 2, fx: 2, fy: 2, cx: 1, cy: 1, baseline: 0.12, captureHz: 10 },
		left: new ArrayBuffer(16),
		right: new ArrayBuffer(16),
	}
}
class FakeWorker implements WorkerPort {
	onmessage: WorkerPort['onmessage'] = null
	onerror: WorkerPort['onerror'] = null
	frames: StereoFrame[] = []
	terminated = false
	postMessage(f: StereoFrame, transfer: ArrayBuffer[]) {
		this.frames.push(structuredClone(f, { transfer }))
	}
	terminate() {
		this.terminated = true
	}
	finish() {
		const f = this.frames.shift()
		if (!f) throw Error('No frame queued')
		const result = processFrame(f)
		this.onmessage?.({ data: structuredClone(result, { transfer: [result.left, result.right] }) })
	}
}
it('transfers ownership, bounds backlog, and returns only increasing frame IDs', () => {
	const worker = new FakeWorker(),
		results: ProcessedFrame[] = [],
		released: StereoFrame[] = []
	const pipeline = new FramePipeline(
		() => worker,
		(f) => results.push(f),
		(f) => released.push(f),
		() => {},
	)
	pipeline.reset(0)
	const first = frame()
	pipeline.offer(first)
	expect(first.left.byteLength).toBe(0)
	pipeline.offer(frame(1))
	pipeline.offer(frame(2))
	expect(pipeline.depth).toBe(2)
	expect(pipeline.dropped).toBe(1)
	worker.finish()
	worker.finish()
	expect(results.map((f) => f.frameId)).toEqual([0, 2])
	expect(results[0].left.byteLength).toBe(16)
	pipeline.offer(frame(1))
	expect(pipeline.depth).toBe(0)
	expect(released.map((f) => f.frameId)).toEqual([1, 1])
})
it('terminates work on reset and rejects late messages from old generations', () => {
	const workers: FakeWorker[] = [],
		results: ProcessedFrame[] = []
	const pipeline = new FramePipeline(
		() => {
			const w = new FakeWorker()
			workers.push(w)
			return w
		},
		(f) => results.push(f),
		() => {},
		() => {},
	)
	pipeline.reset(0)
	pipeline.offer(frame(3))
	pipeline.offer(frame(4))
	pipeline.reset(1)
	expect(workers[0].terminated).toBe(true)
	workers[0].finish()
	expect(results).toHaveLength(0)
	pipeline.offer(frame(0, 1))
	workers[1].finish()
	expect(results[0].generation).toBe(1)
})
it('surfaces worker errors and clears both queue slots', () => {
	const worker = new FakeWorker(),
		errors: string[] = []
	const pipeline = new FramePipeline(
		() => worker,
		() => {},
		() => {},
		(e) => errors.push(e),
	)
	pipeline.reset(0)
	pipeline.offer(frame())
	pipeline.offer(frame(1))
	worker.onerror?.({ message: 'test failure' })
	expect(pipeline.depth).toBe(0)
	expect(worker.terminated).toBe(true)
	expect(errors).toEqual(['test failure'])
})
it('records and replays exact processed pixels without a renderer and validates malformed files', () => {
	const originals = [0, 1, 3].map((id) => {
		const f = frame(id)
		new Uint8Array(f.left).fill(id * 30)
		return processFrame(f)
	})
	const bytes = encodeRecording(originals),
		replayed = decodeRecording(bytes).map(processFrame)
	expect(replayed.map((f) => f.checksum)).toEqual(originals.map((f) => f.checksum))
	expect(replayed.map((f) => f.timestamp)).toEqual([0, 0.1, 0.3])
	expect(() => decodeRecording(bytes.slice(0, -1))).toThrow()
	expect(
		() =>
			encodeRecording([frame(1), frame(0)]) &&
			decodeRecording(encodeRecording([frame(1), frame(0)])),
	).toThrow()
	const damaged = bytes.slice(0)
	new DataView(damaged).setUint32(4, 99999999, true)
	expect(() => decodeRecording(damaged)).toThrow()
})
it('observes every fixed sensor boundary, pauses in lockstep, and emits reset generation zero-time poses', () => {
	const controller = createController({ noise: false }),
		frames: { tick: number; time: number; generation: number; x: number }[] = []
	let blocked = false
	controller.subscribeTicks((s, g) => {
		if (s.tick % 6 === 0) {
			frames.push({ tick: s.tick, time: s.elapsed, generation: g, x: s.truth.pose.x })
			blocked = true
		}
	})
	controller.setAdvanceGuard(() => !blocked)
	controller.play()
	controller.advance(0.1)
	controller.advance(0.1)
	expect(controller.read().tick).toBe(6)
	blocked = false
	controller.advance(0.1)
	expect(frames.map((f) => f.tick)).toEqual([6, 12])
	expect(frames[1].time).toBeCloseTo(0.2, 8)
	controller.reset()
	expect(frames.at(-1)).toEqual({ tick: 0, time: 0, generation: 1, x: 0 })
})

it('resets an active recording replay without rendering and restarts from its first pair', async () => {
	const { createAcquisition } = await import('./runtime')
	const workers: FakeWorker[] = [],
		controller = createController({ noise: false })
	const sensor = createAcquisition(controller, () => {
		const worker = new FakeWorker()
		workers.push(worker)
		return worker
	})
	let captures = 0
	const detach = sensor.attach({
		capture: (_pose, _wheels, left, right) => {
			captures++
			new Uint8Array(left).fill(30)
			new Uint8Array(right).fill(40)
		},
		dispose: () => {},
	})
	workers[0].finish()
	controller.play()
	controller.advance(0.1)
	workers[0].finish()
	controller.pause()
	const bytes = sensor.download(),
		captureCount = captures
	sensor.replay(bytes)
	controller.reset()
	expect(workers[1].terminated).toBe(true)
	workers[1].finish()
	expect(sensor.getSnapshot().latest).toBeNull()
	workers[2].finish()
	workers[2].finish()
	expect(sensor.getSnapshot().status).toBe('Replay complete')
	expect(sensor.getSnapshot().latest?.frameId).toBe(1)
	expect(captures).toBe(captureCount)
	detach()
})
it('reports worker construction failures without throwing into the renderer', () => {
	const errors: string[] = []
	const pipeline = new FramePipeline(
		() => {
			throw Error('Worker unavailable')
		},
		() => {},
		() => {},
		(e) => errors.push(e),
	)
	expect(() => pipeline.reset(0)).not.toThrow()
	expect(errors[0]).toContain('Worker unavailable')
	expect(pipeline.depth).toBe(0)
})

it('pixel recordings exclude large estimator snapshots and preserve only sensor inputs', () => {
	const input = frame(0, 0)
	const enriched = { ...input, vo: { map: 'x'.repeat(3 * 1024 * 1024) } }
	const copy = cloneFrame(enriched)
	expect('vo' in copy).toBe(false)
	const bytes = encodeRecording([enriched])
	expect(new DataView(bytes).getUint32(4, true)).toBeLessThan(2048)
	expect(decodeRecording(bytes)[0].left).toEqual(input.left)
})
