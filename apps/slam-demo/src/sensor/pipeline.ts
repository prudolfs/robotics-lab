import type { StereoFrame } from '@robotics-lab/sensors'
import type { OdometryResult } from '@robotics-lab/vision'
import type { VisionFrame } from './visual'
export type WorkerPort = {
	postMessage: (message: StereoFrame, transfer: ArrayBuffer[]) => void
	terminate: () => void
	onmessage:
		| ((event: {
				data: VisionFrame | { error: string } | { mapUpdate: OdometryResult; generation: number }
		  }) => void)
		| null
	onerror: ((event: { message: string }) => void) | null
}
/** Ownership: active buffers belong to the worker; pending buffers belong to this queue.
 * Results transfer active buffers back. Reset terminates the old owner and invalidates its generation. */
export class FramePipeline {
	private worker: WorkerPort | null = null
	private active: StereoFrame | null = null
	private pending: StereoFrame | null = null
	private last = -1
	generation = 0
	dropped = 0
	constructor(
		private factory: () => WorkerPort,
		private result: (frame: VisionFrame) => void,
		private release: (frame: StereoFrame) => void,
		private failure: (message: string) => void,
		private revise?: (vo: OdometryResult) => void,
	) {}
	get busy() {
		return this.active !== null
	}
	get depth() {
		return Number(this.active !== null) + Number(this.pending !== null)
	}
	reset(generation: number) {
		this.stop()
		this.generation = generation
		this.last = -1
		this.dropped = 0
		let worker: WorkerPort
		try {
			worker = this.factory()
		} catch (error) {
			this.failure(String(error))
			return
		}
		this.worker = worker
		worker.onmessage = ({ data }) => {
			if (this.worker !== worker) return
			if ('mapUpdate' in data) {
				if (data.generation === this.generation && data.mapUpdate.frameId === this.last)
					this.revise?.(data.mapUpdate)
				return
			}
			if ('error' in data) {
				this.stop()
				this.failure(data.error)
				return
			}
			if (
				!this.active ||
				data.generation !== this.generation ||
				data.frameId !== this.active.frameId
			)
				return
			this.active = null
			if (data.frameId > this.last) {
				this.last = data.frameId
				this.result(data)
			} else this.release(data)
			if (this.pending) {
				const next = this.pending
				this.pending = null
				this.send(next)
			}
		}
		worker.onerror = (event) => {
			if (this.worker !== worker) return
			this.stop()
			this.failure(event.message || 'Sensor worker failed')
		}
	}
	private send(frame: StereoFrame) {
		this.active = frame
		try {
			this.worker?.postMessage(frame, [frame.left, frame.right])
		} catch (error) {
			this.stop()
			this.failure(String(error))
		}
	}
	offer(frame: StereoFrame) {
		if (
			!this.worker ||
			frame.generation !== this.generation ||
			frame.frameId <= this.last ||
			frame.frameId <= (this.pending?.frameId ?? this.active?.frameId ?? -1)
		) {
			this.release(frame)
			return
		}
		if (this.active) {
			if (this.pending) {
				this.release(this.pending)
				this.dropped++
			}
			this.pending = frame
		} else this.send(frame)
	}
	stop() {
		this.worker?.terminate()
		this.worker = null
		this.active = null
		if (this.pending) this.release(this.pending)
		this.pending = null
	}
}
