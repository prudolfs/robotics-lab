import { expect, test } from 'vitest'
import { createLidarConfig, generateRays } from './index'

test('generateRays produces the requested number of beams', () => {
	const config = createLidarConfig({ rayCount: 3 })
	const rays = generateRays(config, { x: 0, y: 0, heading: 0 })
	expect(rays).toHaveLength(3)
})

test('rays are centred around the forward direction', () => {
	const config = createLidarConfig({ rayCount: 3, fieldOfView: Math.PI })
	const rays = generateRays(config, { x: 0, y: 0, heading: 0 })
	expect(rays[0].angle).toBeLessThan(0)
	expect(rays[2].angle).toBeGreaterThan(0)
})
