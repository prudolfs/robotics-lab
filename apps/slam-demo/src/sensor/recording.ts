import { type StereoFrame, validateFrame } from '@robotics-lab/sensors'
export const RECORDING_LIMIT = 6
const MAGIC = 0x334d4c53
// Record sensor inputs only. Estimator/map snapshots must never enter a pixel fixture.
function metadata(frame: StereoFrame) {
	return {
		generation: frame.generation,
		frameId: frame.frameId,
		timestamp: frame.timestamp,
		calibration: { ...frame.calibration },
		kind: frame.kind,
		observations: frame.observations?.map((o) => ({
			id: o.id,
			left: [...o.left] as [number, number],
			right: [...o.right] as [number, number],
		})),
		checksum:
			'checksum' in frame && typeof frame.checksum === 'string' ? frame.checksum : undefined,
	}
}
export function cloneFrame(frame: StereoFrame): StereoFrame {
	return { ...metadata(frame), left: frame.left.slice(0), right: frame.right.slice(0) }
}
/** Small Phase 3 pixel fixture, not a simulation/session recording or seek format. */
export function encodeRecording(frames: StereoFrame[]): ArrayBuffer {
	if (!frames.length || frames.length > RECORDING_LIMIT)
		throw Error('Record between one and six pairs')
	const frameMetadata = frames.map((frame) => {
		validateFrame(frame)
		return metadata(frame)
	})
	const header = new TextEncoder().encode(JSON.stringify({ version: 1, frames: frameMetadata }))
	const size =
		8 + header.length + frames.reduce((s, f) => s + f.left.byteLength + f.right.byteLength, 0)
	const output = new Uint8Array(size),
		view = new DataView(output.buffer)
	view.setUint32(0, MAGIC, true)
	view.setUint32(4, header.length, true)
	output.set(header, 8)
	let offset = 8 + header.length
	for (const f of frames)
		for (const b of [f.left, f.right]) {
			output.set(new Uint8Array(b), offset)
			offset += b.byteLength
		}
	return output.buffer
}
export function decodeRecording(buffer: ArrayBuffer): StereoFrame[] {
	if (buffer.byteLength < 8 || buffer.byteLength > 52 * 1024 * 1024)
		throw Error('Invalid fixture size (52 MB maximum)')
	const view = new DataView(buffer),
		length = view.getUint32(4, true)
	if (
		view.getUint32(0, true) !== MAGIC ||
		length > 2 * 1024 * 1024 ||
		length + 8 > buffer.byteLength
	)
		throw Error('Invalid fixture header')
	const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 8, length)))
	if (
		header.version !== 1 ||
		!Array.isArray(header.frames) ||
		!header.frames.length ||
		header.frames.length > RECORDING_LIMIT
	)
		throw Error('Unsupported fixture')
	let offset = 8 + length,
		last = -1
	const frames = header.frames.map((meta: Omit<StereoFrame, 'left' | 'right'>) => {
		const size = meta.calibration?.width * meta.calibration?.height * 4
		if (
			!Number.isInteger(size) ||
			size < 4 ||
			size > 4194304 ||
			offset + 2 * size > buffer.byteLength
		)
			throw Error('Truncated fixture')
		const f: StereoFrame = {
			generation: meta.generation,
			frameId: meta.frameId,
			timestamp: meta.timestamp,
			calibration: {
				width: meta.calibration.width,
				height: meta.calibration.height,
				fx: meta.calibration.fx,
				fy: meta.calibration.fy,
				cx: meta.calibration.cx,
				cy: meta.calibration.cy,
				baseline: meta.calibration.baseline,
				captureHz: meta.calibration.captureHz,
			},
			observations: meta.observations?.map((o) => ({
				id: o.id,
				left: [...o.left],
				right: [...o.right],
			})),
			kind: 'recorded',
			left: buffer.slice(offset, offset + size),
			right: buffer.slice(offset + size, offset + 2 * size),
		}
		validateFrame(f)
		if (f.frameId <= last) throw Error('Fixture frames must be ordered')
		last = f.frameId
		offset += 2 * size
		return f
	})
	if (offset !== buffer.byteLength) throw Error('Unexpected fixture trailing bytes')
	return frames
}
