import { expect, it } from 'vitest'
import {
	identity,
	integrate,
	multiply,
	patchDistance,
	project,
	rotate,
	transpose,
	triangulate,
} from './geometry'

const k = { width: 640, height: 480, fx: 480, fy: 480, cx: 320, cy: 240, baseline: 0.12 }
it('triangulates rectified positive depth and rejects low/negative disparity and row mismatch', () => {
	expect(triangulate([320, 240], [291.2, 240], k)?.[2]).toBeCloseTo(2, 9)
	expect(triangulate([320, 240], [319, 240], k)).toBeNull()
	expect(triangulate([320, 240], [324, 240], k)).toBeNull()
	expect(triangulate([320, 240], [291.2, 242], k)).toBeNull()
})
it('integrates the inverse optical transform without importing world truth', () => {
	const a = 0.3,
		r = [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)]
	const pose = integrate(identity(), r, [0, 0, -0.1])
	const projected = rotate(r, pose.position)
	expect(projected[0]).toBeCloseTo(0, 10)
	expect(projected[2]).toBeCloseTo(0.1, 10)
	const identityR = multiply(r, transpose(r))
	identityR.forEach((v, i) => {
		expect(v).toBeCloseTo(identity().rotation[i], 10)
	})
	expect(project([0, 0, -1], k)).toBeNull()
})
it('uses normalized patch descriptors and rejects flat patches', () => {
	const a = new Uint8Array(32 * 32),
		b = new Uint8Array(32 * 32)
	for (let i = 0; i < a.length; i++) {
		a[i] = (i * 17 + (i % 5) * 13) % 180
		b[i] = a[i] + 20
	}
	expect(patchDistance(a, b, [16, 16], [16, 16], 32, 32)).toBeCloseTo(0, 10)
	expect(patchDistance(a, b, [16, 16], [19, 17], 32, 32)).toBeGreaterThan(0.2)
	expect(
		patchDistance(new Uint8Array(1024), new Uint8Array(1024), [16, 16], [16, 16], 32, 32),
	).toBe(Infinity)
})
