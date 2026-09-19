import { calibration, triangulate, estimatePose, type V3 } from './geometry'
export function gray(rgba: Uint8Array): Uint8Array {
	const g = new Uint8Array(rgba.length / 4)
	for (let i = 0; i < g.length; i++)
		g[i] = (rgba[i * 4] * 77 + rgba[i * 4 + 1] * 150 + rgba[i * 4 + 2] * 29) >> 8
	return g
}
export function detect(g: Uint8Array): [number, number][] {
	const w = calibration.width,
		h = calibration.height,
		candidates: [number, number, number][] = []
	for (let y = 12; y < h - 12; y += 3)
		for (let x = 90; x < w - 12; x += 3) {
			let xx = 0,
				xy = 0,
				yy = 0
			for (let v = -1; v <= 1; v++)
				for (let u = -1; u <= 1; u++) {
					const i = (y + v) * w + x + u,
						dx = g[i + 1] - g[i - 1],
						dy = g[i + w] - g[i - w]
					xx += dx * dx
					xy += dx * dy
					yy += dy * dy
				}
			const score = (xx + yy - Math.sqrt((xx - yy) ** 2 + 4 * xy * xy)) / 2
			if (score > 5000) candidates.push([x, y, score])
		}
	candidates.sort((a, b) => b[2] - a[2])
	const out: [number, number][] = []
	for (const [x, y] of candidates) {
		if (out.every(([a, b]) => (x - a) ** 2 + (y - b) ** 2 > 100)) out.push([x, y])
		if (out.length === 180) break
	}
	return out
}
function match(
	a: Uint8Array,
	b: Uint8Array,
	x: number,
	y: number,
	stereo: boolean,
): [number, number] | null {
	const w = calibration.width
	let best = Infinity,
		second = Infinity,
		bx = 0,
		by = 0
	for (let dy = stereo ? 0 : -8; dy <= (stereo ? 0 : 8); dy++)
		for (let dx = stereo ? -80 : -10; dx <= (stereo ? -1 : 10); dx++) {
			const tx = x + dx,
				ty = y + dy
			if (tx < 4 || tx >= w - 4 || ty < 4 || ty >= 476) continue
			let sum = 0
			for (let v = -3; v <= 3; v++)
				for (let u = -3; u <= 3; u++) {
					const d = a[(y + v) * w + x + u] - b[(ty + v) * w + tx + u]
					sum += d * d
				}
			if (sum < best) {
				second = best
				best = sum
				bx = tx
				by = ty
			} else if (sum < second) second = sum
		}
	return best < 49 * 1600 && best < second * 0.85 ? [bx, by] : null
}
export function runTypeScript(frames: { left: Uint8Array; right: Uint8Array }[]) {
	const start = performance.now(),
		left = gray(frames[0].left),
		right = gray(frames[0].right),
		corners = detect(left),
		points: V3[] = [],
		orig: [number, number][] = []
	for (const [x, y] of corners) {
		const r = match(left, right, x, y, true)
		if (r) {
			const p = triangulate(x, y, r[0])
			if (p) {
				points.push(p)
				orig.push([x, y])
			}
		}
	}
	const initializationMs = performance.now() - start
	const results = frames.slice(1).map((frame) => {
		const t = performance.now(),
			next = gray(frame.left),
			p: V3[] = [],
			uv: [number, number][] = []
		for (let i = 0; i < orig.length; i++) {
			const q = match(left, next, ...orig[i], false)
			if (q) {
				p.push(points[i])
				uv.push(q)
			}
		}
		return { ...estimatePose(p, uv), matches: p.length, ms: performance.now() - t }
	})
	return {
		initializationMs,
		features: corners.length,
		stereoPoints: points.length,
		results,
		totalMs: performance.now() - start,
	}
}
