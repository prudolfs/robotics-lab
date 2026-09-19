import { processFrame, type StereoFrame } from '@robotics-lab/sensors'
import {
	type BundleResult,
	type BundleScheduler,
	type Cv,
	createOdometry,
	type OdometryResult,
} from '@robotics-lab/vision'

// Classic worker: the pinned UMD OpenCV build requires importScripts, not a module worker.
declare const importScripts: (...urls: string[]) => void
declare const cv: Cv & { onRuntimeInitialized?: () => void }
importScripts('/vision/opencv.js')
const ready = new Promise<void>((resolve) => {
	if (cv.Mat) resolve()
	else cv.onRuntimeInitialized = resolve
})
let optimizer: Worker | null = null
let completeBundle: ((result: BundleResult) => void) | null = null
const scheduleBundle: BundleScheduler = (job, done) => {
	completeBundle = done
	optimizer ??= new Worker('/vision/optimizer.js')
	optimizer.onmessage = ({ data }: { data: BundleResult }) => {
		const callback = completeBundle
		completeBundle = null
		callback?.(data)
	}
	optimizer.onerror = () => {
		completeBundle = null
		done({
			...job,
			report: {
				before: 0,
				after: 0,
				iterations: 0,
				accepted: false,
				reason: 'Refinement worker unavailable; map retained',
				milliseconds: 0,
			},
		})
		optimizer?.terminate()
		optimizer = null
	}
	optimizer.postMessage(job)
}
let tracker: ReturnType<typeof createOdometry> | null = null,
	calibrationKey = '',
	generation = -1
self.onmessage = async ({ data }: { data: StereoFrame }) => {
	try {
		await ready
		const start = performance.now(),
			result = processFrame(data)
		const key = JSON.stringify(data.calibration)
		if (generation !== data.generation || calibrationKey !== key) {
			tracker?.dispose()
			optimizer?.terminate()
			optimizer = null
			completeBundle = null
			tracker = null
			generation = data.generation
			calibrationKey = key
		}
		let vo: OdometryResult | null = null
		// Oracle observations are never used as image-derived motion estimates, including in recordings.
		if (data.kind !== 'synthetic' && !data.observations) {
			tracker ??= createOdometry(cv, data.calibration, { mapping: true, scheduleBundle })
			vo = tracker.process(
				new Uint8Array(result.left),
				new Uint8Array(result.right),
				data.frameId,
				data.timestamp,
			)
		}
		result.processingMs = performance.now() - start
		self.postMessage({ ...result, vo }, { transfer: [result.left, result.right] })
	} catch (error) {
		tracker?.dispose()
		optimizer?.terminate()
		optimizer = null
		completeBundle = null
		tracker = null
		self.postMessage({ error: error instanceof Error ? error.message : String(error) })
	}
}
