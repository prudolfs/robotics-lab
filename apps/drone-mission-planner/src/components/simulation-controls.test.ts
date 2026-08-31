import { formatSimulationTime } from '@/simulation/format'

describe('simulation clock formatting', () => {
	it('formats minutes and fractional seconds', () => {
		expect(formatSimulationTime(0)).toBe('00:00.00')
		expect(formatSimulationTime(65.25)).toBe('01:05.25')
	})
})
