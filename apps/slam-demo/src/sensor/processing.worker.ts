import { processFrame, type StereoFrame } from '@robotics-lab/sensors'
import { type Cv, createOdometry, type OdometryResult } from '@robotics-lab/vision'

// Classic worker: the pinned UMD OpenCV build requires importScripts, not a module worker.
declare const importScripts: (...urls: string[]) => void
declare const cv: Cv & { onRuntimeInitialized?: () => void }
importScripts('/vision/opencv.js')
const ready = new Promise<void>((resolve) => {
	if (cv.Mat) resolve()
	else cv.onRuntimeInitialized = resolve
})
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
			tracker = null
			generation = data.generation
			calibrationKey = key
		}
		let vo: OdometryResult | null = null
		// Oracle observations are never used as image-derived motion estimates, including in recordings.
		if (data.kind !== 'synthetic' && !data.observations) {
			tracker ??= createOdometry(cv, data.calibration)
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
		tracker = null
		self.postMessage({ error: error instanceof Error ? error.message : String(error) })
	}
}
