import { bootstrapWaypoints, formatHeading, missionDistance } from './mission'

describe('mission helpers', () => {
	it('calculates the horizontal route distance', () => {
		expect(missionDistance(bootstrapWaypoints)).toBeCloseTo(14.207, 3)
	})

	it('formats a normalized heading', () => {
		expect(formatHeading(-Math.PI / 2)).toBe('270°')
	})
})
