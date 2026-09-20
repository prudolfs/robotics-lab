import {
	type CameraPose,
	cameraCenter,
	type ProcessedFrame,
	type Vec3,
} from '@robotics-lab/sensors'
import { multiply, type OdometryResult, type Pose3, rotate, transpose } from '@robotics-lab/vision'
import manifest from '../../../../assets/slam-demo/manifest.json'
export type VisionFrame = ProcessedFrame & { vo?: OdometryResult | null }
export type VisualPoint = { x: number; y: number; z: number; frameId: number }
const opticalToRobot = [0, 0, 1, -1, 0, 0, 0, -1, 0]
/** Evaluator/presentation only: a single origin alignment, never fed back to the worker. */
export function createVisualEvaluation() {
	let lastTruth: CameraPose | undefined
	let lastError = 0
	let lastFrame = -1
	let origin: { position: Vec3; rotation: number[] } | null = null,
		trail: VisualPoint[] = [],
		correctedTrail: VisualPoint[] = [],
		beforeClosureTrail: VisualPoint[] = [],
		sum = 0,
		count = 0,
		error: number | null = null
	const api = {
		reset() {
			lastTruth = undefined
			lastFrame = -1
			lastError = 0
			origin = null
			trail = []
			correctedTrail = []
			beforeClosureTrail = []
			sum = 0
			count = 0
			error = null
		},
		revise(vo: OdometryResult) {
			if (vo.frameId === lastFrame && lastTruth) api.accept(vo, lastTruth)
		},
		accept(vo: OdometryResult | null | undefined, truth: CameraPose | undefined) {
			error = null
			if (!vo?.pose || !truth) return
			if (!origin && vo.referenceFrameId === vo.frameId) {
				const c = Math.cos(truth.heading),
					s = Math.sin(truth.heading)
				origin = {
					position: cameraCenter(truth, manifest.mounts.Camera_Left as Vec3),
					rotation: multiply([c, -s, 0, s, c, 0, 0, 0, 1], opticalToRobot),
				}
			}
			if (!origin || vo.acceptedFrameId !== vo.frameId || vo.status === 'lost') return
			const rotation = multiply(origin.rotation, vo.pose.rotation),
				offset = rotate(origin.rotation, vo.pose.position),
				bodyRotation = multiply(rotation, transpose(opticalToRobot)),
				mount = rotate(bodyRotation, manifest.mounts.Camera_Left as Vec3)
			const position = origin.position.map((v, i) => v + offset[i] - mount[i]) as Vec3
			const alignment = origin
			const convert = (pose: Pose3, frameId: number): VisualPoint => {
				const r = multiply(alignment.rotation, pose.rotation),
					offset = rotate(alignment.rotation, pose.position),
					mount = rotate(
						multiply(r, transpose(opticalToRobot)),
						manifest.mounts.Camera_Left as Vec3,
					)
				const p = alignment.position.map((v, i) => v + offset[i] - mount[i])
				return { x: p[0], y: p[1], z: p[2], frameId }
			}
			if (vo.map?.loop.corrections) {
				correctedTrail = vo.map.loop.trajectory.map((f) => convert(f.pose, f.frameId))
				beforeClosureTrail = vo.map.loop.before.map((f) => convert(f.pose, f.frameId))
			}
			error = Math.hypot(position[0] - truth.x, position[1] - truth.y, position[2])
			if (lastFrame === vo.frameId) {
				sum -= lastError * lastError
				trail = trail.filter((p) => p.frameId !== vo.frameId)
			} else count++
			sum += error * error
			lastTruth = truth
			lastFrame = vo.frameId
			lastError = error
			trail = [
				...trail.slice(-1199),
				{ x: position[0], y: position[1], z: position[2], frameId: vo.frameId },
			]
		},
		snapshot: () => ({
			origin,
			trail,
			displayTrail: correctedTrail.length ? correctedTrail : trail,
			beforeClosureTrail,
			error,
			rms: count ? Math.sqrt(sum / count) : null,
			samples: count,
		}),
	}
	return api
}
