import {
	type CameraPose,
	cameraCenter,
	type ProcessedFrame,
	type Vec3,
} from '@robotics-lab/sensors'
import { multiply, type OdometryResult, rotate, transpose } from '@robotics-lab/vision'
import manifest from '../../../../assets/slam-demo/manifest.json'
export type VisionFrame = ProcessedFrame & { vo?: OdometryResult | null }
export type VisualPoint = { x: number; y: number; z: number; frameId: number }
const opticalToRobot = [0, 0, 1, -1, 0, 0, 0, -1, 0]
/** Evaluator/presentation only: a single origin alignment, never fed back to the worker. */
export function createVisualEvaluation() {
	let origin: { position: Vec3; rotation: number[] } | null = null,
		trail: VisualPoint[] = [],
		sum = 0,
		count = 0,
		error: number | null = null
	return {
		reset() {
			origin = null
			trail = []
			sum = 0
			count = 0
			error = null
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
			error = Math.hypot(position[0] - truth.x, position[1] - truth.y, position[2])
			sum += error * error
			count++
			trail = [
				...trail.slice(-1199),
				{ x: position[0], y: position[1], z: position[2], frameId: vo.frameId },
			]
		},
		snapshot: () => ({
			origin,
			trail,
			error,
			rms: count ? Math.sqrt(sum / count) : null,
			samples: count,
		}),
	}
}
