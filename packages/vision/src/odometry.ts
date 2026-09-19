import {
	coverage,
	identity,
	integrate,
	patchDistance,
	project,
	rotate,
	triangulate,
} from './geometry'
import type {
	Calibration,
	Cv,
	FeatureOverlay,
	Mat,
	OdometryResult,
	Pixel,
	Pose3,
	V3,
} from './types'
export const FEATURE_LIMIT = 480
export class NativeScope {
	private mats: Mat[] = []
	constructor(private ledger: { live: number; peak: number }) {}
	own = (mat: Mat) => {
		this.mats.push(mat)
		this.ledger.live++
		this.ledger.peak = Math.max(this.ledger.peak, this.ledger.live)
		return mat
	}
	dispose() {
		for (const mat of this.mats.reverse()) {
			mat.delete()
			this.ledger.live--
		}
		this.mats = []
	}
}
export function solveMotion(
	cv: Cv,
	points: V3[],
	pixels: Pixel[],
	k: Calibration,
	seed: number,
	scope: NativeScope,
) {
	if (points.length < 8) return null
	const own = scope.own,
		objects = own(cv.matFromArray(points.length, 1, cv.CV_32FC3, points.flat())),
		images = own(cv.matFromArray(pixels.length, 1, cv.CV_32FC2, pixels.flat()))
	const camera = own(cv.matFromArray(3, 3, cv.CV_64F, [k.fx, 0, k.cx, 0, k.fy, k.cy, 0, 0, 1])),
		dist = own(cv.Mat.zeros(4, 1, cv.CV_64F)),
		rv = own(new cv.Mat()),
		tv = own(new cv.Mat()),
		inliers = own(new cv.Mat()),
		rotation = own(new cv.Mat())
	cv.setRNGSeed(seed | 0)
	const ok = cv.solvePnPRansac(
		objects,
		images,
		camera,
		dist,
		rv,
		tv,
		false,
		120,
		2,
		0.995,
		inliers,
		cv.SOLVEPNP_ITERATIVE,
	)
	if (!ok || inliers.rows < 8) return null
	const ids = Array.from(inliers.data32S),
		objIn = own(
			cv.matFromArray(
				ids.length,
				1,
				cv.CV_32FC3,
				ids.flatMap((i) => points[i]),
			),
		),
		imgIn = own(
			cv.matFromArray(
				ids.length,
				1,
				cv.CV_32FC2,
				ids.flatMap((i) => pixels[i]),
			),
		)
	if (!cv.solvePnP(objIn, imgIn, camera, dist, rv, tv, true, cv.SOLVEPNP_ITERATIVE)) return null
	cv.Rodrigues(rv, rotation)
	const r = Array.from(rotation.data64F),
		t = Array.from(tv.data64F) as V3
	if (r.length !== 9 || t.length !== 3 || ![...r, ...t].every(Number.isFinite)) return null
	const predictions = points.map((p) => {
		const q = rotate(r, p)
		return project(q.map((v, i) => v + t[i]) as V3, k)
	})
	const residual = (i: number) => {
		const prediction = predictions[i]
		return prediction
			? Math.hypot(prediction[0] - pixels[i][0], prediction[1] - pixels[i][1])
			: Infinity
	}
	const accepted = ids.filter((i) => residual(i) <= 2.5)
	const rmse = Math.sqrt(
		accepted.reduce((sum, i) => sum + residual(i) ** 2, 0) / Math.max(1, accepted.length),
	)
	return { r, t, inliers: accepted, rmse, predictions }
}
/** Frame-to-frame stereo VO. No map, loop closure, ground truth or wheel input. */
export function createOdometry(cv: Cv, k: Calibration) {
	const ledger = { live: 0, peak: 0 },
		persistent = new NativeScope(ledger)
	const left = persistent.own(new cv.Mat(k.height, k.width, cv.CV_8UC1)),
		right = persistent.own(new cv.Mat(k.height, k.width, cv.CV_8UC1)),
		reference = persistent.own(new cv.Mat(k.height, k.width, cv.CV_8UC1))
	let anchorPixels: Pixel[] = [],
		anchorPoints: V3[] = [],
		anchorPose: Pose3 = identity(),
		pose: Pose3 | null = null
	let originId: number | null = null,
		acceptedId: number | null = null,
		anchorTime = 0,
		lastFrame = -1,
		failures = 0,
		terminal = false
	const flow = (a: Mat, b: Mat, pixels: Pixel[], scope: NativeScope) => {
		const own = scope.own,
			pts = own(cv.matFromArray(pixels.length, 1, cv.CV_32FC2, pixels.flat())),
			out = own(new cv.Mat()),
			status = own(new cv.Mat()),
			error = own(new cv.Mat()),
			back = own(new cv.Mat()),
			backStatus = own(new cv.Mat()),
			backError = own(new cv.Mat())
		const size = new cv.Size(21, 21),
			criteria = new cv.TermCriteria(3, 30, 0.01)
		cv.calcOpticalFlowPyrLK(a, b, pts, out, status, error, size, 3, criteria)
		cv.calcOpticalFlowPyrLK(b, a, out, back, backStatus, backError, size, 3, criteria)
		return pixels.map((p, i) => {
			const q: Pixel = [out.data32F[2 * i], out.data32F[2 * i + 1]],
				fb = Math.hypot(back.data32F[2 * i] - p[0], back.data32F[2 * i + 1] - p[1])
			return {
				q,
				ok: Boolean(
					status.data[i] &&
						backStatus.data[i] &&
						fb < 0.8 &&
						error.data32F[i] < 25 &&
						q[0] >= 8 &&
						q[1] >= 8 &&
						q[0] < k.width - 8 &&
						q[1] < k.height - 8,
				),
			}
		})
	}
	return {
		process(
			leftRgba: Uint8Array,
			rightRgba: Uint8Array,
			frameId: number,
			timestamp: number,
		): OdometryResult {
			if (leftRgba.length !== k.width * k.height * 4 || rightRgba.length !== leftRgba.length)
				throw Error('VO image size does not match calibration')
			if (frameId <= lastFrame) throw Error('VO frames must be strictly ordered')
			lastFrame = frameId
			const scope = new NativeScope(ledger)
			const result: OdometryResult = {
				status: 'initializing',
				reason: 'Waiting for a textured stereo pair',
				frameId,
				timestamp,
				referenceFrameId: originId,
				acceptedFrameId: acceptedId,
				pose,
				detected: 0,
				stereo: 0,
				matches: 0,
				inliers: 0,
				rmse: null,
				coverage: 0,
				overlays: [],
				nativeObjects: ledger.live,
				peakNativeObjects: ledger.peak,
				wasmHeapBytes: cv.HEAP8.buffer.byteLength,
			}
			const fail = (reason: string) => {
				failures++
				terminal = terminal || failures >= 5 || Boolean(pose && timestamp - anchorTime > 1)
				result.status = terminal ? 'lost' : pose ? 'degraded' : 'initializing'
				result.reason = reason
				return result
			}
			try {
				if (terminal) {
					result.status = 'lost'
					result.reason = 'Tracking lost; reset to establish a new visual origin'
					return result
				}
				for (let i = 0; i < left.data.length; i++) {
					left.data[i] = leftRgba[i * 4]
					right.data[i] = rightRgba[i * 4]
				}
				const corners = scope.own(new cv.Mat()),
					mask = scope.own(new cv.Mat())
				cv.goodFeaturesToTrack(left, corners, 1200, 0.004, 5, mask, 3, false, 0.04)
				const pixels: Pixel[] = [],
					cells = new Map<string, number>()
				for (let i = 0; i < corners.rows && pixels.length < FEATURE_LIMIT; i++) {
					const p: Pixel = [corners.data32F[i * 2], corners.data32F[i * 2 + 1]],
						cell = `${Math.floor((p[0] / k.width) * 8)},${Math.floor((p[1] / k.height) * 6)}`
					if (
						p[0] < 8 ||
						p[1] < 8 ||
						p[0] >= k.width - 8 ||
						p[1] >= k.height - 8 ||
						(cells.get(cell) ?? 0) >= 16
					)
						continue
					cells.set(cell, (cells.get(cell) ?? 0) + 1)
					pixels.push(p)
				}
				result.detected = pixels.length
				if (pixels.length < 8) return fail('Too few image corners')
				const stereoFlow = flow(left, right, pixels, scope),
					stereoPixels: Pixel[] = [],
					stereoPoints: V3[] = []
				for (let i = 0; i < pixels.length; i++) {
					const p = pixels[i],
						q = stereoFlow[i].q,
						point = stereoFlow[i].ok ? triangulate(p, q, k) : null
					const distance = point
						? patchDistance(left.data, right.data, p, q, k.width, k.height)
						: Infinity
					// Compare distant candidates on the epipolar row: repeated shelves must not supply arbitrary depths.
					let ambiguous = false
					if (point && distance < 0.25)
						for (let d = 3; d <= Math.min(100, p[0] - 8); d += 2) {
							const u = p[0] - d
							if (Math.abs(u - q[0]) < 3) continue
							const alternative = patchDistance(
								left.data,
								right.data,
								p,
								[u, q[1]],
								k.width,
								k.height,
							)
							if (alternative < distance * 1.15 + 0.015) {
								ambiguous = true
								break
							}
						}
					const accepted = Boolean(point && distance < 0.25 && !ambiguous)
					if (accepted && point) {
						stereoPixels.push(p)
						stereoPoints.push(point)
					}
					result.overlays.push({
						u: p[0],
						v: p[1],
						accepted,
						reason: accepted ? 'stereo' : ambiguous ? 'ambiguous stereo' : 'stereo rejected',
					})
				}
				result.stereo = stereoPoints.length
				result.coverage = coverage(stereoPixels, k)
				if (!pose) {
					if (stereoPoints.length < 16 || result.coverage < 4)
						return fail('Insufficient well-conditioned stereo points')
					pose = identity()
					originId = frameId
					acceptedId = frameId
					failures = 0
					result.reason = 'Stereo origin established; waiting for motion'
					result.pose = pose
					result.referenceFrameId = originId
					result.acceptedFrameId = frameId
				} else {
					if (timestamp - anchorTime > 1)
						return fail('Input gap exceeds the one-second tracking window')
					const tracks = flow(reference, left, anchorPixels, scope),
						points: V3[] = [],
						current: Pixel[] = [],
						previous: Pixel[] = []
					tracks.forEach((track, i) => {
						if (
							track.ok &&
							patchDistance(
								reference.data,
								left.data,
								anchorPixels[i],
								track.q,
								k.width,
								k.height,
							) < 0.4
						) {
							points.push(anchorPoints[i])
							current.push(track.q)
							previous.push(anchorPixels[i])
						}
					})
					result.matches = points.length
					if (points.length < 8) return fail('Too few forward/backward consistent tracks')
					const motion = solveMotion(cv, points, current, k, frameId + 42, scope)
					if (!motion) return fail('RANSAC found no supported camera motion')
					result.inliers = motion.inliers.length
					result.rmse = motion.rmse
					result.coverage = coverage(
						motion.inliers.map((i) => current[i]),
						k,
					)
					const ratio = motion.inliers.length / points.length,
						dt = Math.max(0.001, timestamp - anchorTime),
						angle = Math.acos(
							Math.max(-1, Math.min(1, (motion.r[0] + motion.r[4] + motion.r[8] - 1) / 2)),
						)
					const inliers = new Set(motion.inliers)
					const overlays: FeatureOverlay[] = current.map((p, i) => ({
						u: p[0],
						v: p[1],
						from: previous[i],
						prediction: motion.predictions[i] ?? undefined,
						accepted: inliers.has(i),
						reason: inliers.has(i) ? 'PnP inlier' : 'PnP outlier',
					}))
					result.overlays = overlays
					if (
						motion.inliers.length < 8 ||
						ratio < 0.35 ||
						result.coverage < 3 ||
						motion.rmse > 2 ||
						Math.hypot(...motion.t) > dt * 3 + 0.03 ||
						angle > dt * 3 + 0.03
					)
						return fail('Motion failed inlier, residual, coverage or plausibility gates')
					pose = integrate(anchorPose, motion.r, motion.t)
					acceptedId = frameId
					failures = 0
					result.pose = pose
					result.acceptedFrameId = frameId
					result.status =
						motion.inliers.length >= 16 &&
						ratio >= 0.6 &&
						motion.rmse < 1.25 &&
						stereoPoints.length >= 16
							? 'tracking'
							: 'degraded'
					result.reason =
						result.status === 'tracking'
							? 'Image-derived stereo visual odometry'
							: 'Motion accepted with limited visual support'
				}
				if (stereoPoints.length >= 16 && coverage(stereoPixels, k) >= 4) {
					left.copyTo(reference)
					anchorPixels = stereoPixels
					anchorPoints = stereoPoints
					anchorPose = pose
					anchorTime = timestamp
				}
				return result
			} finally {
				scope.dispose()
				result.nativeObjects = ledger.live
				result.peakNativeObjects = ledger.peak
			}
		},
		dispose() {
			persistent.dispose()
			anchorPixels = []
			anchorPoints = []
		},
		nativeObjects: () => ledger.live,
	}
}
