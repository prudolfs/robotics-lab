import type { MapSnapshot, Pose3, V3 } from '@robotics-lab/vision'
import { useEffect, useRef, useState } from 'react'
import { Matrix4, Quaternion } from 'three'

const mix = (a: V3, b: V3, t: number) => a.map((v, i) => v + (b[i] - v) * t) as V3
function quaternion(p: Pose3) {
	const r = p.rotation
	return new Quaternion().setFromRotationMatrix(
		new Matrix4().set(r[0], r[1], r[2], 0, r[3], r[4], r[5], 0, r[6], r[7], r[8], 0, 0, 0, 0, 1),
	)
}
function mixPose(a: Pose3, b: Pose3, t: number): Pose3 {
	const e = new Matrix4().makeRotationFromQuaternion(quaternion(a).slerp(quaternion(b), t)).elements
	return {
		position: mix(a.position, b.position, t),
		rotation: [e[0], e[4], e[8], e[1], e[5], e[9], e[2], e[6], e[10]],
	}
}
/** Display-only interpolation. Neither input nor any estimator result is mutated. */
export function interpolateMap(a: MapSnapshot, b: MapSnapshot, t: number): MapSnapshot {
	const p = new Map(a.landmarks.map((p) => [p.id, p])),
		f = new Map(a.keyframes.map((f) => [f.id, f]))
	return {
		...b,
		pose: mixPose(a.pose, b.pose, t),
		landmarks: b.landmarks.map((v) => ({
			...v,
			position: mix(p.get(v.id)?.position ?? v.position, v.position, t),
		})),
		keyframes: b.keyframes.map((v) => ({
			...v,
			pose: mixPose(f.get(v.id)?.pose ?? v.pose, v.pose, t),
		})),
	}
}
export function useAnimatedMap(map?: MapSnapshot) {
	const [display, setDisplay] = useState(map),
		shown = useRef(map),
		target = useRef(map),
		animation = useRef<{ from: MapSnapshot; start: number } | null>(null),
		request = useRef(0)
	useEffect(() => {
		const previous = target.current
		target.current = map
		if (!map || !previous || map.revision < previous.revision) {
			animation.current = null
			shown.current = map
			setDisplay(map)
			return
		}
		if (map.loop.corrections > previous.loop.corrections) {
			animation.current = { from: shown.current ?? previous, start: performance.now() }
		}
		if (!animation.current) {
			shown.current = map
			setDisplay(map)
			return
		}
		const tick = () => {
			const a = animation.current,
				to = target.current
			if (!a || !to) return
			const progress = Math.min(1, (performance.now() - a.start) / 650),
				smooth = progress * progress * (3 - 2 * progress),
				frame = interpolateMap(a.from, to, smooth)
			shown.current = frame
			setDisplay(frame)
			if (progress < 1) request.current = requestAnimationFrame(tick)
			else animation.current = null
		}
		cancelAnimationFrame(request.current)
		request.current = requestAnimationFrame(tick)
	}, [map])
	useEffect(() => () => cancelAnimationFrame(request.current), [])
	return display
}
