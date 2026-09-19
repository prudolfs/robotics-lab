import type { Calibration, Pixel, Pose3, V3 } from './types'
export const identity = (): Pose3 => ({
	rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
	position: [0, 0, 0],
})
export function rotate(r: number[], p: V3): V3 {
	return [0, 1, 2].map((i) => r[i * 3] * p[0] + r[i * 3 + 1] * p[1] + r[i * 3 + 2] * p[2]) as V3
}
export function transpose(r: number[]) {
	return [r[0], r[3], r[6], r[1], r[4], r[7], r[2], r[5], r[8]]
}
export function multiply(a: number[], b: number[]) {
	return Array.from({ length: 9 }, (_, i) => {
		const row = Math.floor(i / 3),
			col = i % 3
		return a[row * 3] * b[col] + a[row * 3 + 1] * b[3 + col] + a[row * 3 + 2] * b[6 + col]
	})
}
/** PnP maps reference points into current optical coordinates; integrate its inverse. */
export function integrate(reference: Pose3, r: number[], t: V3): Pose3 {
	const inverse = transpose(r),
		offset = rotate(inverse, t.map((v) => -v) as V3),
		delta = rotate(reference.rotation, offset)
	return {
		rotation: multiply(reference.rotation, inverse),
		position: reference.position.map((v, i) => v + delta[i]) as V3,
	}
}
export function project(point: V3, k: Calibration): Pixel | null {
	return point[2] > 0
		? [(k.fx * point[0]) / point[2] + k.cx, (k.fy * point[1]) / point[2] + k.cy]
		: null
}
export function triangulate(left: Pixel, right: Pixel, k: Calibration): V3 | null {
	const d = left[0] - right[0]
	if (
		![...left, ...right].every(Number.isFinite) ||
		Math.abs(left[1] - right[1]) > 0.75 ||
		d < 2.5 ||
		d > 128
	)
		return null
	const z = (k.fx * k.baseline) / d
	if (z < 0.2 || z > 20) return null
	return [((left[0] - k.cx) * z) / k.fx, ((left[1] - k.cy) * z) / k.fy, z]
}
export function coverage(points: Pixel[], k: Calibration) {
	return new Set(
		points.map(([u, v]) => `${Math.floor((u / k.width) * 8)},${Math.floor((v / k.height) * 6)}`),
	).size
}
/** Zero-mean patch descriptor distance; rejects brightness changes and flat patches. */
export function patchDistance(
	a: Uint8Array,
	b: Uint8Array,
	p: Pixel,
	q: Pixel,
	w: number,
	h: number,
) {
	const x = Math.round(p[0]),
		y = Math.round(p[1]),
		u = Math.round(q[0]),
		v = Math.round(q[1])
	if (Math.min(x, y, u, v) < 4 || x >= w - 4 || u >= w - 4 || y >= h - 4 || v >= h - 4)
		return Infinity
	let sa = 0,
		sb = 0,
		aa = 0,
		bb = 0,
		ab = 0,
		n = 0
	for (let dy = -3; dy <= 3; dy++)
		for (let dx = -3; dx <= 3; dx++) {
			const av = a[(y + dy) * w + x + dx],
				bv = b[(v + dy) * w + u + dx]
			sa += av
			sb += bv
			aa += av * av
			bb += bv * bv
			ab += av * bv
			n++
		}
	const va = aa - (sa * sa) / n,
		vb = bb - (sb * sb) / n
	return va > 25 && vb > 25 ? 1 - (ab - (sa * sb) / n) / Math.sqrt(va * vb) : Infinity
}
