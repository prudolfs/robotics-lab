/** Pure calibrated stereo geometry. Canonical world: X forward, Y left, Z up;
 * optical: X right, Y down, Z forward. Images are top-down RGBA8. */
export type Vec3 = [number, number, number]
export type Pixel = [number, number]
export type StereoCalibration = {
	width: number
	height: number
	fx: number
	fy: number
	cx: number
	cy: number
	baseline: number
	captureHz: number
}
export type CameraPose = { x: number; y: number; heading: number }
export type Box3 = { min: Vec3; max: Vec3 }
export type Observation = { id: number; left: Pixel; right: Pixel }
export function project(point: Vec3, k: StereoCalibration): Pixel | null {
	const [x, y, z] = point
	if (!point.every(Number.isFinite) || z < 0.05 || z > 30) return null
	const u = (k.fx * x) / z + k.cx,
		v = (k.fy * y) / z + k.cy
	return u >= 0 && u < k.width && v >= 0 && v < k.height ? [u, v] : null
}
export function unproject([u, v]: Pixel, depth: number, k: StereoCalibration): Vec3 {
	if (!Number.isFinite(depth) || depth <= 0) throw Error('Depth must be positive')
	return [((u - k.cx) * depth) / k.fx, ((v - k.cy) * depth) / k.fy, depth]
}
export function cameraCenter(pose: CameraPose, mount: Vec3): Vec3 {
	const c = Math.cos(pose.heading),
		s = Math.sin(pose.heading)
	return [pose.x + c * mount[0] - s * mount[1], pose.y + s * mount[0] + c * mount[1], mount[2]]
}
export function toOptical(point: Vec3, pose: CameraPose, mount: Vec3): Vec3 {
	const center = cameraCenter(pose, mount),
		dx = point[0] - center[0],
		dy = point[1] - center[1]
	const c = Math.cos(pose.heading),
		s = Math.sin(pose.heading)
	return [s * dx - c * dy, center[2] - point[2], c * dx + s * dy]
}
/** Segment-AABB intersection; the point's own supporting surface is not an occluder. */
export function occluded(origin: Vec3, point: Vec3, boxes: Box3[]): boolean {
	return boxes.some((box) => {
		let lo = 1e-6,
			hi = 1 - 1e-6
		for (let i = 0; i < 3; i++) {
			const d = point[i] - origin[i]
			if (Math.abs(d) < 1e-12) {
				if (origin[i] < box.min[i] || origin[i] > box.max[i]) return false
			} else {
				const a = (box.min[i] - origin[i]) / d,
					b = (box.max[i] - origin[i]) / d
				lo = Math.max(lo, Math.min(a, b))
				hi = Math.min(hi, Math.max(a, b))
			}
			if (lo > hi) return false
		}
		return true
	})
}
export function random(seed: number) {
	let state = seed >>> 0
	return () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0
		return state / 4294967296
	}
}
export function frameSeed(seed: number, frameId: number, eye = 0) {
	return (seed ^ Math.imul(frameId + 1, 0x9e3779b9) ^ Math.imul(eye + 1, 0x85ebca6b)) >>> 0
}
export function dropped(seed: number, frameId: number, probability: number) {
	return random(frameSeed(seed, frameId, 2))() < probability
}
/** Simulator-only oracle. Consumers receive pixels/IDs, never these world coordinates or poses. */
export function syntheticObservations(
	points: Vec3[],
	boxes: Box3[],
	pose: CameraPose,
	mounts: [Vec3, Vec3],
	k: StereoCalibration,
	seed: number,
	noisePx = 0,
	dropout = 0,
): Observation[] {
	const rng = random(seed),
		out: Observation[] = []
	points.forEach((point, id) => {
		if (rng() < dropout) return
		const pixels = mounts.map((m) =>
			occluded(cameraCenter(pose, m), point, boxes) ? null : project(toOptical(point, pose, m), k),
		)
		if (!pixels[0] || !pixels[1]) return
		const jitter = (p: Pixel): Pixel => [
			p[0] + (rng() - 0.5) * 2 * noisePx,
			p[1] + (rng() - 0.5) * 2 * noisePx,
		]
		const left = jitter(pixels[0]),
			right = jitter(pixels[1])
		if (
			[...left, ...right].every(Number.isFinite) &&
			[left, right].every(([u, v]) => u >= 0 && u < k.width && v >= 0 && v < k.height)
		)
			out.push({ id, left, right })
	})
	return out
}
/** Seeded bounded uniform read noise, applied to actual RGB samples before worker transfer. */
export function pixelNoise(bytes: Uint8Array, amplitude: number, seed: number) {
	if (amplitude === 0) return
	const rng = random(seed)
	for (let i = 0; i < bytes.length; i += 4)
		for (let c = 0; c < 3; c++)
			bytes[i + c] = Math.max(
				0,
				Math.min(255, Math.round(bytes[i + c] + (rng() - 0.5) * 2 * amplitude)),
			)
}
export function flipRows(bytes: Uint8Array, width: number, height: number) {
	const stride = width * 4
	for (let y = 0; y < Math.floor(height / 2); y++)
		for (let x = 0; x < stride; x++) {
			const a = y * stride + x,
				b = (height - 1 - y) * stride + x,
				t = bytes[a]
			bytes[a] = bytes[b]
			bytes[b] = t
		}
}
export type StereoFrame = {
	generation: number
	frameId: number
	timestamp: number
	calibration: StereoCalibration
	kind: 'rendered' | 'synthetic' | 'recorded'
	left: ArrayBuffer
	right: ArrayBuffer
	observations?: Observation[]
}
export type ProcessedFrame = StereoFrame & { checksum: string; mean: number; processingMs: number }
export function validateFrame(f: StereoFrame) {
	const k = f.calibration
	if (
		!k ||
		![k.width, k.height].every((n) => Number.isInteger(n) && n > 0 && n <= 1024) ||
		![k.fx, k.fy, k.baseline, k.captureHz].every((n) => Number.isFinite(n) && n > 0) ||
		![k.cx, k.cy].every(Number.isFinite)
	)
		throw Error('Invalid calibration')
	if (
		!Number.isInteger(f.frameId) ||
		f.frameId < 0 ||
		!Number.isInteger(f.generation) ||
		f.generation < 0 ||
		!Number.isFinite(f.timestamp) ||
		Math.abs(f.timestamp - f.frameId / k.captureHz) > 1e-7
	)
		throw Error('Invalid frame clock')
	if (!['rendered', 'synthetic', 'recorded'].includes(f.kind)) throw Error('Invalid input mode')
	if (f.left.byteLength !== k.width * k.height * 4 || f.right.byteLength !== f.left.byteLength)
		throw Error('Invalid stereo buffer size')
	if (
		f.observations &&
		(!Array.isArray(f.observations) ||
			f.observations.length > 4096 ||
			!f.observations.every(
				(o) =>
					Number.isInteger(o.id) &&
					o.left.length === 2 &&
					o.right.length === 2 &&
					[...o.left, ...o.right].every(Number.isFinite),
			))
	)
		throw Error('Invalid observations')
}
/** Phase 3 preprocessing only. No feature extraction, correspondences or pose estimation. */
export function processFrame(frame: StereoFrame): ProcessedFrame {
	validateFrame(frame)
	let hash = 2166136261,
		sum = 0
	for (const buffer of [frame.left, frame.right]) {
		const bytes = new Uint8Array(buffer)
		for (let i = 0; i < bytes.length; i += 4) {
			const gray = (77 * bytes[i] + 150 * bytes[i + 1] + 29 * bytes[i + 2] + 128) >> 8
			bytes[i] = gray
			bytes[i + 1] = gray
			bytes[i + 2] = gray
			bytes[i + 3] = 255
			hash = Math.imul(hash ^ gray, 16777619) >>> 0
			sum += gray
		}
	}
	return {
		...frame,
		checksum: hash.toString(16).padStart(8, '0'),
		mean: sum / (frame.calibration.width * frame.calibration.height * 2),
		processingMs: 0,
	}
}
export function drawObservations(frame: StereoFrame) {
	for (const [eye, buffer] of [
		['left', frame.left],
		['right', frame.right],
	] as const) {
		const bytes = new Uint8Array(buffer)
		bytes.fill(12)
		for (let i = 3; i < bytes.length; i += 4) bytes[i] = 255
		for (const o of frame.observations ?? []) {
			const [u, v] = o[eye]
			for (let dy = -2; dy <= 2; dy++)
				for (let dx = -2; dx <= 2; dx++) {
					const x = Math.round(u) + dx,
						y = Math.round(v) + dy
					if (x < 0 || x >= frame.calibration.width || y < 0 || y >= frame.calibration.height)
						continue
					const i = (y * frame.calibration.width + x) * 4
					bytes[i] = 240
					bytes[i + 1] = 240
					bytes[i + 2] = 240
				}
		}
	}
}
