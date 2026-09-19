export type V3 = [number, number, number]
export const calibration = {
	width: 640,
	height: 480,
	fx: 480,
	fy: 480,
	cx: 320,
	cy: 240,
	baseline: 0.12,
}
// Canonical right-handed world: X forward, Y left, Z up. Legacy world Y maps to -Y.
export function legacyToWorld(x: number, y: number, z = 0): V3 {
	return [x, -y, z]
}
export function worldToLegacy([x, y, z]: V3): V3 {
	return [x, -y, z]
}
export function worldToScene([x, y, z]: V3): V3 {
	return [x, z, -y]
}
export function sceneToWorld([x, y, z]: V3): V3 {
	return [x, -z, y]
}
export function worldToBlender(p: V3): V3 {
	return [...p]
}
export function blenderToGltf([x, y, z]: V3): V3 {
	return [x, z, -y]
}
// Optical X right, Y down, Z forward -> robot X forward, Y left, Z up.
export function opticalToRobot([x, y, z]: V3): V3 {
	return [z, -x, -y]
}
export function robotToOptical([x, y, z]: V3): V3 {
	return [-y, -z, x]
}
export function triangulate(u: number, v: number, rightU: number): V3 | null {
	const d = u - rightU
	if (d < 1) return null
	const z = (calibration.fx * calibration.baseline) / d
	return [
		((u - calibration.cx) * z) / calibration.fx,
		((v - calibration.cy) * z) / calibration.fy,
		z,
	]
}
export function project([x, y, z]: V3): [number, number] {
	return [(calibration.fx * x) / z + calibration.cx, (calibration.fy * y) / z + calibration.cy]
}
export function transform(p: V3, q: number[]): V3 {
	const [a, b, c] = q
	const t = Math.hypot(a, b, c)
	let r = p
	if (t > 1e-12) {
		const k = [a / t, b / t, c / t],
			co = Math.cos(t),
			si = Math.sin(t),
			dot = k[0] * p[0] + k[1] * p[1] + k[2] * p[2]
		r = [0, 1, 2].map(
			(i) =>
				p[i] * co +
				(k[(i + 1) % 3] * p[(i + 2) % 3] - k[(i + 2) % 3] * p[(i + 1) % 3]) * si +
				k[i] * dot * (1 - co),
		) as V3
	}
	return [r[0] + q[3], r[1] + q[4], r[2] + q[5]]
}
function solve(a: number[][], b: number[]): number[] {
	const m = a.map((r, i) => [...r, b[i]])
	for (let c = 0; c < 6; c++) {
		let best = c
		for (let r = c + 1; r < 6; r++) if (Math.abs(m[r][c]) > Math.abs(m[best][c])) best = r
		;[m[c], m[best]] = [m[best], m[c]]
		const d = m[c][c]
		if (Math.abs(d) < 1e-10) throw Error('Singular pose fit')
		for (let j = c; j < 7; j++) m[c][j] /= d
		for (let r = 0; r < 6; r++)
			if (r !== c) {
				const k = m[r][c]
				for (let j = c; j < 7; j++) m[r][j] -= k * m[c][j]
			}
	}
	return m.map((r) => r[6])
}
export function estimatePose(
	points: V3[],
	pixels: [number, number][],
): { pose: number[]; rms: number } {
	if (points.length < 12) throw Error('Insufficient matches')
	const q = [0, 0, 0, 0, 0, 0]
	for (let it = 0; it < 15; it++) {
		const a = Array.from({ length: 6 }, () => Array(6).fill(0)),
			b = Array(6).fill(0)
		for (let i = 0; i < points.length; i++) {
			const uv = project(transform(points[i], q)),
				e = [pixels[i][0] - uv[0], pixels[i][1] - uv[1]],
				w = Math.min(1, 2 / Math.max(1e-9, Math.hypot(...e)))
			const j = Array.from({ length: 6 }, (_, k) => {
				const v = [...q]
				v[k] += 1e-6
				const t = project(transform(points[i], v))
				return [(t[0] - uv[0]) / 1e-6, (t[1] - uv[1]) / 1e-6]
			})
			for (let x = 0; x < 6; x++) {
				b[x] += w * (j[x][0] * e[0] + j[x][1] * e[1])
				for (let y = 0; y < 6; y++) a[x][y] += w * (j[x][0] * j[y][0] + j[x][1] * j[y][1])
			}
		}
		const d = solve(a, b)
		for (let k = 0; k < 6; k++) q[k] += d[k]
		if (Math.hypot(...d) < 1e-7) break
	}
	const residual = points.map((p, i) => {
		const uv = project(transform(p, q))
		return (uv[0] - pixels[i][0]) ** 2 + (uv[1] - pixels[i][1]) ** 2
	})
	return { pose: q, rms: Math.sqrt(residual.reduce((a, b) => a + b, 0) / points.length) }
}
