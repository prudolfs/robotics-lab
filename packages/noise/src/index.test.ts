// Noise model tests: deterministic, seeded, and pure.

import { expect, test } from 'vitest'
import {
	applySaltAndPepper,
	encoderDrift,
	gaussian,
	gaussianN,
	seededRng,
	shouldDrop,
	wheelSlip,
} from './index'

test('seededRng produces identical sequences for the same seed', () => {
	const rng1 = seededRng(42)
	const rng2 = seededRng(42)
	for (let i = 0; i < 100; i++) {
		expect(rng1()).toBe(rng2())
	}
})

test('seededRng produces different sequences for different seeds', () => {
	const rng1 = seededRng(42)
	const rng2 = seededRng(43)
	const a = rng1()
	const b = rng2()
	expect(a).not.toBe(b)
})

test('seededRng output is in [0, 1)', () => {
	const rng = seededRng(0)
	for (let i = 0; i < 1000; i++) {
		const v = rng()
		expect(v).toBeGreaterThanOrEqual(0)
		expect(v).toBeLessThan(1)
	}
})

test('gaussian with default seeded rng has zero mean', () => {
	const rng = seededRng(123)
	let sum = 0
	const n = 10000
	for (let i = 0; i < n; i++) sum += gaussian(rng)
	const mean = sum / n
	expect(Math.abs(mean)).toBeLessThan(0.05)
})

test('gaussianN applies mean and stdDev', () => {
	const rng = seededRng(456)
	const vals: number[] = []
	for (let i = 0; i < 1000; i++) {
		vals.push(gaussianN(5, 2, rng))
	}
	const mean = vals.reduce((a, b) => a + b, 0) / vals.length
	expect(Math.abs(mean - 5)).toBeLessThan(0.15)
})

test('shouldDrop with rate=0 never triggers', () => {
	const rng = seededRng(0)
	for (let i = 0; i < 100; i++) {
		expect(shouldDrop(0, rng)).toBe(false)
	}
})

test('shouldDrop with rate=1 always triggers', () => {
	const rng = seededRng(0)
	for (let i = 0; i < 100; i++) {
		expect(shouldDrop(1, rng)).toBe(true)
	}
})

test('shouldDrop with rate=0.5 triggers roughly half the time', () => {
	const rng = seededRng(789)
	let count = 0
	for (let i = 0; i < 10000; i++) {
		if (shouldDrop(0.5, rng)) count++
	}
	expect(count / 10000).toBeGreaterThan(0.45)
	expect(count / 10000).toBeLessThan(0.55)
})

test('wheelSlip with sigma=0 returns identity', () => {
	const [l, r] = wheelSlip(0, seededRng(0))
	expect(l).toBe(1)
	expect(r).toBe(1)
})

test('wheelSlip perturbations are centred around 1', () => {
	const rng = seededRng(999)
	let lSum = 0
	let rSum = 0
	const n = 1000
	for (let i = 0; i < n; i++) {
		const [l, r] = wheelSlip(0.1, rng)
		lSum += l
		rSum += r
	}
	expect(Math.abs(lSum / n - 1)).toBeLessThan(0.01)
	expect(Math.abs(rSum / n - 1)).toBeLessThan(0.01)
})

test('encoderDrift with sigma=0 returns 0', () => {
	expect(encoderDrift(0, seededRng(0))).toBe(0)
})

test('encoderDrift produces values near zero for small sigma', () => {
	const rng = seededRng(111)
	let sum = 0
	for (let i = 0; i < 10000; i++) sum += encoderDrift(0.001, rng)
	expect(Math.abs(sum / 10000)).toBeLessThan(0.0005)
})

test('applySaltAndPepper modifies pixels', () => {
	const width = 8
	const height = 8
	const data = new Uint8ClampedArray(width * height * 4).fill(128)
	const before = data.slice()
	const rng = seededRng(0)
	applySaltAndPepper(data, width, height, 0.5, rng)
	let changed = 0
	for (let i = 0; i < data.length; i++) {
		if (data[i] !== before[i]) changed++
	}
	expect(changed).toBeGreaterThan(0)
})
