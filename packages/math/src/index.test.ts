import { clamp, degreesToRadians, lerp, radiansToDegrees } from './index'

describe('math helpers', () => {
	it('clamps values to an inclusive range', () => {
		expect(clamp(-1, 0, 10)).toBe(0)
		expect(clamp(12, 0, 10)).toBe(10)
	})

	it('interpolates and converts angles', () => {
		expect(lerp(10, 20, 0.25)).toBe(12.5)
		expect(degreesToRadians(180)).toBeCloseTo(Math.PI)
		expect(radiansToDegrees(Math.PI / 2)).toBeCloseTo(90)
	})
})
