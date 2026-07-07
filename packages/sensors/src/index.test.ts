// Sensor tests — deterministic and framework-independent.

import { seededRng } from '@robotics-lab/noise'
import { expect, test } from 'vitest'
import { createLidarConfig, generateRays } from './index'
import { createScan } from './scan'

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

// --- Dropout noise (milestone 10) -----------------------------------------

test('createScan with dropoutRate=0 reports hits for rays that intersect obstacles', () => {
	// Wall directly in front of the robot (robot at origin, facing +x).
	const world = {
		name: 'test',
		width: 10,
		depth: 10,
		walls: [{ kind: 'wall' as const, start: { x: 2, y: 2 }, end: { x: 2, y: -2 } }],
		boxes: [],
		cylinders: [],
	}
	const config = createLidarConfig({ rayCount: 36, range: 5, dropoutRate: 0 })
	const rng = seededRng(123)
	const scan = createScan(config, { x: 0, y: 0, heading: 0 }, world, rng)
	const hits = scan.samples.filter((s) => s.hit !== null).length
	// With no dropout, all rays that hit should report a hit.
	expect(hits).toBeGreaterThan(0)
})

test('createScan applies dropouts when dropoutRate > 0', () => {
	// Wall directly in front of the robot.
	const world = {
		name: 'test',
		width: 10,
		depth: 10,
		walls: [{ kind: 'wall' as const, start: { x: 2, y: 2 }, end: { x: 2, y: -2 } }],
		boxes: [],
		cylinders: [],
	}
	const config = createLidarConfig({ rayCount: 36, range: 5, dropoutRate: 0.5 })
	const rng = seededRng(123)
	const scan = createScan(config, { x: 0, y: 0, heading: 0 }, world, rng)
	const hits = scan.samples.filter((s) => s.hit !== null).length
	// With 50% dropout, roughly half of the rays should report hits.
	expect(hits).toBeGreaterThan(0)
	expect(hits).toBeLessThan(36)
})
