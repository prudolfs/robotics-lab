import {
	drawObservations,
	dropped,
	frameSeed,
	type ProcessedFrame,
	pixelNoise,
	type StereoFrame,
	syntheticObservations,
	type Vec3,
} from '@robotics-lab/sensors'
import manifest from '../../../../assets/slam-demo/manifest.json'
import type { SimulationController } from '../sim/controller'
import type { Simulation } from '../sim/simulation'
import type { CaptureAdapter } from './capture'
import { FramePipeline, type WorkerPort } from './pipeline'
import { cloneFrame, decodeRecording, encodeRecording, RECORDING_LIMIT } from './recording'
export type SensorOptions = {
	mode: 'rendered' | 'synthetic'
	timing: 'realtime' | 'lockstep'
	noise: number
	dropout: number
}
const calibration = manifest.calibration
const mounts = [manifest.mounts.Camera_Left, manifest.mounts.Camera_Right] as [Vec3, Vec3]
const points: Vec3[] = []
for (const x of [-4, -2, 0, 2, 4])
	for (const y of [-3.5, -2.5, -1.5, 0.5, 2.5, 3.5])
		for (const z of [0.2, 0.6, 1, 1.4]) points.push([x, y, z])
const boxes = manifest.obstacles.map((o) => ({
	min: [o.x - o.width / 2, o.y - o.depth / 2, 0] as Vec3,
	max: [o.x + o.width / 2, o.y + o.depth / 2, o.height] as Vec3,
}))
export function createAcquisition(
	controller: SimulationController,
	workerFactory?: () => WorkerPort,
) {
	const listeners = new Set<() => void>(),
		pool: ArrayBuffer[] = []
	let options: SensorOptions = { mode: 'rendered', timing: 'realtime', noise: 0, dropout: 0 }
	let latest: ProcessedFrame | null = null,
		records: StereoFrame[] = [],
		adapter: CaptureAdapter | null = null
	let replay: StereoFrame[] | null = null,
		replayIndex = 0,
		generation = -1,
		last = -1,
		sensorDrops = 0,
		received = 0
	let status = 'Loading sensor',
		error = '',
		latency = 0,
		captureMs = 0,
		firstTimestamp = 0,
		firstReceivedAt = 0,
		lastReceivedAt = 0,
		ready = false
	const starts = new Map<number, number>()
	const release = (f: StereoFrame) => {
		starts.delete(f.frameId)
		for (const b of [f.left, f.right])
			if (b.byteLength === calibration.width * calibration.height * 4 && pool.length < 4)
				pool.push(b)
	}
	const pipeline = new FramePipeline(
		workerFactory ??
			(() =>
				new Worker(new URL('./processing.worker.ts', import.meta.url), {
					type: 'module',
				}) as unknown as WorkerPort),
		(frame) => {
			if (latest) release(latest)
			latest = frame
			latency = performance.now() - (starts.get(frame.frameId) ?? performance.now())
			starts.delete(frame.frameId)
			if (received === 0) {
				firstTimestamp = frame.timestamp
				firstReceivedAt = performance.now()
			}
			lastReceivedAt = performance.now()
			received++
			records.push(cloneFrame(frame))
			if (records.length > RECORDING_LIMIT) records.shift()
			status = replay ? 'Replaying pixels' : 'Ready'
			publish()
			if (replay) {
				if (replayIndex < replay.length) sendReplay()
				else {
					status = 'Replay complete'
					publish()
				}
			}
		},
		release,
		(message) => {
			starts.clear()
			error = message
			status = 'Sensor error'
			controller.pause()
			publish()
		},
	)
	function snapshot() {
		return {
			options,
			latest,
			status,
			error,
			latency,
			captureMs,
			received,
			sensorDrops,
			backlogDrops: pipeline.dropped,
			queueDepth: pipeline.depth,
			generation,
			recorded: records.length,
			replaying: replay !== null,
			wallRate:
				received > 1 && lastReceivedAt > firstReceivedAt
					? ((received - 1) * 1000) / (lastReceivedAt - firstReceivedAt)
					: 0,
			rate:
				received > 1 && latest && latest.timestamp > firstTimestamp
					? (received - 1) / (latest.timestamp - firstTimestamp)
					: 0,
		}
	}
	let published = snapshot()
	function publish() {
		published = snapshot()
		for (const listener of listeners) listener()
	}
	function clear() {
		if (latest) release(latest)
		latest = null
		records = []
		received = 0
		sensorDrops = 0
		last = -1
		latency = 0
		captureMs = 0
		error = ''
		starts.clear()
	}
	function submit(frame: StereoFrame) {
		starts.set(frame.frameId, performance.now())
		pipeline.offer(frame)
		// Dropped pending frames release their telemetry entry; only active/pending timestamps remain.
		publish()
	}
	function sendReplay() {
		const source = replay?.[replayIndex++]
		if (source) submit({ ...cloneFrame(source), kind: 'recorded', generation })
	}
	function tick(state: Simulation, epoch: number) {
		if (!adapter || !ready) return
		if (epoch !== generation) {
			generation = epoch
			clear()
			pipeline.reset(generation)
			if (error) return
			status = replay ? 'Replaying pixels' : 'Ready'
			if (replay) {
				replayIndex = 0
				sendReplay()
				return
			}
		}
		if (replay || error || state.tick % 6 !== 0 || state.tick === last) return
		last = state.tick
		const frameId = state.tick / 6
		if (dropped(state.config.seed, frameId, options.dropout)) {
			sensorDrops++
			publish()
			return
		}
		const size = calibration.width * calibration.height * 4
		const frame: StereoFrame = {
			generation,
			frameId,
			timestamp: frameId / calibration.captureHz,
			calibration,
			kind: options.mode,
			left: pool.pop() ?? new ArrayBuffer(size),
			right: pool.pop() ?? new ArrayBuffer(size),
		}
		const start = performance.now()
		try {
			if (options.mode === 'rendered')
				adapter.capture(state.truth.pose, state.wheelAngles, frame.left, frame.right)
			else {
				frame.observations = syntheticObservations(
					points,
					boxes,
					state.truth.pose,
					mounts,
					calibration,
					frameSeed(state.config.seed, frameId),
					options.noise / 16,
					options.dropout,
				)
				drawObservations(frame)
			}
			pixelNoise(
				new Uint8Array(frame.left),
				options.noise,
				frameSeed(state.config.seed, frameId, 0),
			)
			pixelNoise(
				new Uint8Array(frame.right),
				options.noise,
				frameSeed(state.config.seed, frameId, 1),
			)
			captureMs = performance.now() - start
			submit(frame)
		} catch (reason) {
			release(frame)
			error = String(reason)
			status = 'Sensor error'
			controller.pause()
			publish()
		}
	}
	return {
		subscribe(listener: () => void) {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		getSnapshot: () => published,
		attach(next: CaptureAdapter) {
			adapter = next
			ready = true
			generation = -1
			controller.setAdvanceGuard(
				() => !error && !replay && (options.timing === 'realtime' || !pipeline.busy),
			)
			const unsub = controller.subscribeTicks(tick)
			tick(controller.read(), controller.getGeneration())
			return () => {
				unsub()
				ready = false
				pipeline.stop()
				clear()
				adapter = null
				controller.setAdvanceGuard(() => true)
				next.dispose()
			}
		},
		configure(next: Partial<SensorOptions>) {
			options = { ...options, ...next }
			replay = null
			controller.reset()
			publish()
		},
		download() {
			return encodeRecording(records)
		},
		replay(buffer: ArrayBuffer) {
			const frames = decodeRecording(buffer)
			controller.pause()
			replay = frames
			replayIndex = 0
			controller.reset()
		},
		live() {
			replay = null
			replayIndex = 0
			controller.reset()
		},
		fail(message: string) {
			pipeline.stop()
			starts.clear()
			error = message
			status = 'Sensor error'
			controller.pause()
			publish()
		},
		retry() {
			replay = null
			generation = -1
			controller.reset()
		},
	}
}
export type Acquisition = ReturnType<typeof createAcquisition>
