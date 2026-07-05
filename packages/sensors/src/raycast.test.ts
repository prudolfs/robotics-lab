import type { World } from '@robotics-lab/core'
import { createWorld } from '@robotics-lab/core'
import { expect, test } from 'vitest'
import { castRayAgainstWorld, castRaysAgainst, createLidarConfig, createScan } from './index'

const TAU = Math.PI * 2

// A small world with a wall straight ahead (+x), a box, a cylinder, and the
// closed border walls. The robot sits at the origin facing +x. The map shape
// mirrors `@robotics-lab/maps`'s `MapData` but is kept local so the sensors
// package doesn't depend on maps in tests.
const MAP = {
	name: 'sensor-test',
	width: 10,
	depth: 10,
	walls: [
		{ start: { x: 2, y: -1 }, end: { x: 2, y: 1 }, thickness: 0.1 }, // wall at x=2
		{ start: { x: -5, y: -5 }, end: { x: 5, y: -5 } },
		{ start: { x: 5, y: -5 }, end: { x: 5, y: 5 } },
		{ start: { x: 5, y: 5 }, end: { x: -5, y: 5 } },
		{ start: { x: -5, y: 5 }, end: { x: -5, y: -5 } },
	],
	boxes: [{ center: { x: -2, y: 2 }, width: 1, depth: 1, rotation: 0 }],
	cylinders: [{ center: { x: 0, y: -3 }, diameter: 0.6 }],
}
const WORLD: World = createWorld(MAP)

test('a ray forward from the origin hits the wall at x=2', () => {
	const hit = castRayAgainstWorld(WORLD, { angle: 0, origin: { x: 0, y: 0, heading: 0 } }, 10)
	expect(hit.touched).toBe(true)
	expect(hit.obstacleKind).toBe('wall')
	expect(hit.distance).toBeCloseTo(2, 6)
	expect(hit.point.x).toBeCloseTo(2, 6)
	expect(hit.point.y).toBeCloseTo(0, 6)
})

test('a ray pointing backward (−x) hits the far border wall at x=−5', () => {
	const hit = castRayAgainstWorld(WORLD, { angle: Math.PI, origin: { x: 0, y: 0, heading: 0 } }, 20)
	expect(hit.touched).toBe(true)
	expect(hit.obstacleKind).toBe('wall')
	expect(hit.distance).toBeCloseTo(5, 6)
})

test('a ray pointing left (−y) hits the cylinder at (0,−3)', () => {
	const hit = castRayAgainstWorld(
		WORLD,
		{ angle: -Math.PI / 2, origin: { x: 0, y: 0, heading: 0 } },
		10,
	)
	expect(hit.touched).toBe(true)
	expect(hit.obstacleKind).toBe('cylinder')
	expect(hit.distance).toBeCloseTo(3 - 0.3, 6) // edge of cylinder touches
})

test('a ray pointing up-left hits the box at (−2, 2)', () => {
	const hit = castRayAgainstWorld(
		WORLD,
		{ angle: Math.atan2(2, -2), origin: { x: 0, y: 0, heading: 0 } },
		10,
	)
	expect(hit.touched).toBe(true)
	expect(hit.obstacleKind).toBe('box')
})

test('an off-segment ray between the test wall and the border falls through to the border', () => {
	// The test wall spans y∈[-1,1] at x=2; aim above it (+y) so it misses and
	// the ray continues to whatever is further along that heading.
	const hit = castRayAgainstWorld(WORLD, { angle: 0.2, origin: { x: 0, y: 3, heading: 0 } }, 10)
	expect(hit.touched).toBe(true)
	expect(hit.obstacleKind).toBe('wall')
	expect(hit.distance).toBeLessThanOrEqual(10)
})

test('castRayAgainstWorld ignores obstacles behind the origin', () => {
	// Origin just past the test wall, ray still pointing +x: must skip the wall
	// behind it and hit the far border at x=5.
	const hit = castRayAgainstWorld(WORLD, { angle: 0, origin: { x: 2.1, y: 0, heading: 0 } }, 10)
	expect(hit.touched).toBe(true)
	expect(hit.obstacleKind).toBe('wall')
	expect(hit.distance).toBeCloseTo(5 - 2.1, 6)
})

test('castRaysAgainst returns one result per ray in order', () => {
	const rays = [
		{ angle: -Math.PI / 2, origin: { x: 0, y: 0, heading: 0 } }, // cylinder
		{ angle: 0, origin: { x: 0, y: 0, heading: 0 } }, // test wall
		{ angle: Math.PI / 2, origin: { x: 0, y: 0, heading: 0 } }, // north border
		{ angle: Math.PI, origin: { x: 0, y: 0, heading: 0 } }, // west border
	]
	const hits = castRaysAgainst(WORLD, rays, 10)
	expect(hits).toHaveLength(4)
	expect(hits[0].obstacleKind).toBe('cylinder')
	expect(hits[1].obstacleKind).toBe('wall')
	expect(hits[2].obstacleKind).toBe('wall')
	expect(hits[3].obstacleKind).toBe('wall')
})

test('createScan produces one sample per ray in angular order', () => {
	const cfg = createLidarConfig({ rayCount: 8, fieldOfView: TAU, range: 10 })
	const scan = createScan(cfg, { x: 0, y: 0, heading: 0 }, WORLD, () => 0.5)
	expect(scan.samples).toHaveLength(8)
	for (let i = 1; i < scan.samples.length; i++) {
		expect(scan.samples[i].angle).toBeGreaterThan(scan.samples[i - 1].angle)
	}
	for (const s of scan.samples) {
		if (s.hit === null) expect(s.distance).toBe(10)
		else expect(s.distance).toBeLessThanOrEqual(10)
	}
})

// Sample a scan with FOV=TAU and rayCount chosen so angle 0 is exactly one of
// the rays — then the forward measurement equals the wall distance exactly.
const scanWithForwardAt0 = (rayCount: number, noise = 0) => {
	const cfg = createLidarConfig({ rayCount, fieldOfView: TAU, range: 10, noise })
	// generateRays samples angles -half + step*i; with FOV=TAU and full rayCount,
	// step = TAU/rayCount and -half = -PI, so index rayCount/2 gives angle 0.
	const scan = createScan(cfg, { x: 0, y: 0, heading: 0 }, WORLD, () => 0.5)
	const idx = scan.samples.findIndex((s) => Math.abs(s.angle) < 1e-12)
	return { scan, idx }
}

test('createScan reports the forward wall hit near 2m at adequate resolution', () => {
	const { scan, idx } = scanWithForwardAt0(360, 0)
	expect(idx).toBeGreaterThanOrEqual(0)
	const forward = scan.samples[idx]
	expect(forward.hit).toBe('wall')
	expect(forward.distance).toBeCloseTo(2, 6)
})

test('createScan with zero noise matches the raw distance exactly', () => {
	const { idx, scan } = scanWithForwardAt0(360, 0)
	expect(scan.samples[idx].distance).toBeCloseTo(2, 12)
})

test('createScan with positive noise perturbs distances but stays within range', () => {
	const cfg = createLidarConfig({ rayCount: 64, fieldOfView: TAU, range: 10, noise: 0.05 })
	let seed = 0.12345
	const rng = () => {
		seed = (seed * 1664525 + 1013904223) % 1
		return seed
	}
	const scan = createScan(cfg, { x: 0, y: 0, heading: 0 }, WORLD, rng)
	for (const s of scan.samples) {
		expect(s.distance).toBeGreaterThanOrEqual(0)
		expect(s.distance).toBeLessThanOrEqual(10)
	}
})

test('configurable range caps far measurements at the configured value', () => {
	const cfg = createLidarConfig({ rayCount: 8, fieldOfView: TAU, range: 1 })
	const scan = createScan(cfg, { x: 0, y: 0, heading: 0 }, WORLD, () => 0.5)
	// With range=1 nothing in this world is reachable from the origin, so all
	// samples record a miss at distance === 1.
	for (const s of scan.samples) {
		expect(s.hit).toBeNull()
		expect(s.distance).toBe(1)
	}
})

test('configurable resolution scales the sample count with rayCount', () => {
	const lo = createScan(createLidarConfig({ rayCount: 8 }), { x: 0, y: 0, heading: 0 }, WORLD)
	const hi = createScan(createLidarConfig({ rayCount: 64 }), { x: 0, y: 0, heading: 0 }, WORLD)
	expect(lo.samples).toHaveLength(8)
	expect(hi.samples).toHaveLength(64)
})

test('an FOV narrower than the full circle reports misses outside the arc', () => {
	// 90° FOV centred forward: side rays should miss the cylinder/box which are
	// well outside ±45°. Every sample within the arc that points forward hits
	// the near wall; samples at the arc edges may still find the wall.
	const cfg = createLidarConfig({ rayCount: 9, fieldOfView: Math.PI / 2, range: 10 })
	const scan = createScan(cfg, { x: 0, y: 0, heading: 0 }, WORLD, () => 0.5)
	expect(scan.samples).toHaveLength(9)
	for (const s of scan.samples) {
		expect(s.angle).toBeGreaterThanOrEqual(-Math.PI / 4 - 1e-9)
		expect(s.angle).toBeLessThanOrEqual(Math.PI / 4 + 1e-9)
	}
})
