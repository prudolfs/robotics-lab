import { processFrame, type StereoFrame } from '@robotics-lab/sensors'

// No simulation, world manifest, pose, scene, depth map or object IDs enter this worker.
self.onmessage = ({ data }: { data: StereoFrame }) => {
	try {
		const start = performance.now(),
			result = processFrame(data)
		result.processingMs = performance.now() - start
		self.postMessage(result, { transfer: [result.left, result.right] })
	} catch (error) {
		self.postMessage({ error: error instanceof Error ? error.message : String(error) })
	}
}
