// Deterministic noise utilities for sensor and motion simulation.
//
// All functions accept a seeded `Rng` so the simulation stays testable and
// reproducible. `Rng` is a plain function returning a uniform in [0, 1).
//
// Design intent: the noise module is pure math with no React / Three.js
// dependencies, so it can run in the browser, in Node and in tests.

/** Pseudo-random number generator type signature. */
export type Rng = () => number

/** Linear congruential generator seeded to a 32-bit unsigned integer.
 *  Produces a deterministic sequence of uniform values in [0, 1).
 *
 *  Use this for the sensor noise model when you need reproducible runs.
 *  `seed=12345` is the default; callers may override with the current
 *  simulation step count or a GUI seed knob.
 */
export function seededRng(seed: number = 12345): Rng {
	// SplitMix32 — fast, decent quality, only 32-bit state.
	// See https://prng.di.unimi.it/splitmix64.c for provenance.
	let s = seed >>> 0
	return () => {
		s = (s + 0x9e3779b9) >>> 0
		let z = s
		z = (z ^ (z >>> 16)) >>> 0
		z = (z + (z << 2)) >>> 0
		z = z ^ (z >>> 4)
		z = ((z + (z << 6)) >>> 0) ^ (z >>> 8)
		z = (z + (z << 4)) >>> 0
		z = z ^ (z >>> 15)
		return (z >>> 0) / 4294967296
	}
}

// --- Gaussian noise -------------------------------------------------------

/** Box–Muller transform: one standard-normal sample from two uniform [0,1). */
export function gaussian(rng: Rng): number {
	let u = 0
	let v = 0
	while (u === 0) u = rng()
	while (v === 0) v = rng()
	return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/** Gaussian with given `mean` and `stdDev`. */
export function gaussianN(mean: number, stdDev: number, rng: Rng): number {
	return mean + gaussian(rng) * stdDev
}

// --- Dropout noise --------------------------------------------------------

/** True with probability `rate` (0–1). `rate=0` never drops, `rate=1` always. */
export function shouldDrop(rate: number, rng: Rng): boolean {
	if (rate <= 0) return false
	if (rate >= 1) return true
	return rng() < rate
}

// --- Salt-and-pepper / pixel noise ----------------------------------------

/** Apply salt-and-pepper noise to a greyscale pixel array in place.
 *  `rate` is the fraction of pixels to corrupt.
 *  Each corrupted pixel becomes 0 (pepper) or 255 (salt) with equal probability.
 */
export function applySaltAndPepper(
	data: Uint8ClampedArray,
	width: number,
	height: number,
	rate: number,
	rng: Rng,
): void {
	const n = width * height
	const corrupted = Math.floor(rate * n)
	for (let i = 0; i < corrupted; i++) {
		const idx = Math.floor(rng() * n) * 4 // RGBA stride
		const val = rng() < 0.5 ? 0 : 255
		data[idx] = val
		data[idx + 1] = val
		data[idx + 2] = val
	}
}

// --- Motion disturbance models --------------------------------------------

/** Small random wheel-speed perturbation, e.g. for wheel slip simulation.
 *  Returns a pair of multipliers (left, right) each centred on 1.0 with
 *  standard deviation `sigma`.
 */
export function wheelSlip(sigma: number, rng: Rng): [number, number] {
	if (sigma <= 0) return [1, 1]
	return [1 + gaussian(rng) * sigma, 1 + gaussian(rng) * sigma]
}

/** Encoder drift: a small angular offset that accumulates over time.
 *  Returns a heading perturbation in radians.
 */
export function encoderDrift(sigma: number, rng: Rng): number {
	if (sigma <= 0) return 0
	return gaussian(rng) * sigma
}
