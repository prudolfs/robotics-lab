import { processFrame, type StereoFrame } from '@robotics-lab/sensors'
import {
	type BundleResult,
	type BundleScheduler,
	type Cv,
	createOdometry,
	type GraphResult,
	type GraphScheduler,
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
		publishCorrection()
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
		graphWorker?.terminate()
		graphWorker = null
		optimizer = null
	}
	optimizer.postMessage(job)
}
let graphWorker: Worker | null = null
const scheduleGraph: GraphScheduler = (job, done) => {
	graphWorker ??= new Worker('/vision/graph.js')
	graphWorker.onmessage = ({ data }: { data: GraphResult }) => {
		done(data)
		publishCorrection()
	}
	graphWorker.onerror = () => {
		done({ ...job, before: 0, after: 0, iterations: 0, accepted: false, milliseconds: 0 })
		graphWorker?.terminate()
		graphWorker = null
	}
	graphWorker.postMessage(job)
}
let tracker: ReturnType<typeof createOdometry> | null = null,
	calibrationKey = '',
	generation = -1
function publishCorrection() {
	const vo = tracker?.applyCorrections()
	if (vo) self.postMessage({ mapUpdate: vo, generation })
}
self.onmessage = async ({
	data,
}: {
	data: StereoFrame & { vision?: { loopClosure?: boolean; synchronous?: boolean } }
}) => {
	try {
		await ready
		const start = performance.now(),
			result = processFrame(data)
		const key = JSON.stringify([data.calibration, data.vision])
		if (generation !== data.generation || calibrationKey !== key) {
			tracker?.dispose()
			optimizer?.terminate()
			graphWorker?.terminate()
			graphWorker = null
			optimizer = null
			completeBundle = null
			tracker = null
			generation = data.generation
			calibrationKey = key
		}
		let vo: OdometryResult | null = null
		// Oracle observations are never used as image-derived motion estimates, including in recordings.
		if (data.kind !== 'synthetic' && !data.observations) {
			tracker ??= createOdometry(cv, data.calibration, {
				mapping: true,
				loopClosure: data.vision?.loopClosure ?? true,
				scheduleBundle: data.vision?.synchronous ? undefined : scheduleBundle,
				scheduleGraph: data.vision?.synchronous ? undefined : scheduleGraph,
			})
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
		graphWorker?.terminate()
		graphWorker = null
		optimizer = null
		completeBundle = null
		tracker = null
		self.postMessage({ error: error instanceof Error ? error.message : String(error) })
	}
}
