// Probability <-> log-odds conversions and occupancy classification.
//
// Log-odds occupancy is the working representation inside `OccupancyGrid.cells`.
// Callers usually want a probability in [0,1] (-1 = unknown):
//
//   log-odds L = ln( p / (1 - p) )
//   p          = 1 / (1 + exp(-L))
//
// We clamp L to [-CLAMP, +CLAMP] so a single noisy update cannot permanently
// lock a cell. With the default update strengths this allows a cell to flip
// back after a few contradicting observations.

/** Bounding range for log-odds values. Keeps the map reversible under noise. */
export const LOG_ODDS_CLAMP = 4.0

/** Default strength added to occupied cells (hit endpoint). */
export const OCCUPIED_INCREMENT = 0.85

/** Default strength subtracted from free cells (cells the ray passes through). */
export const FREE_INCREMENT = 0.4

/** Sentinel: `p === UNKNOWN_PROB` means "no evidence yet" for display. */
export const UNKNOWN_PROB = -1

export function clampLogOdds(value: number): number {
	return Math.max(-LOG_ODDS_CLAMP, Math.min(LOG_ODDS_CLAMP, value))
}

/** Convert occupancy probability to its log-odds. `0.5` -> `0` (unknown). */
export function logOdds(probability: number): number {
	const p = Math.min(0.999999, Math.max(0.000001, probability))
	return Math.log(p / (1 - p))
}

/** Convert log-odds back to a probability in [0,1]. */
export function probability(logOddsValue: number): number {
	return 1 / (1 + Math.exp(-logOddsValue))
}

/** Cell tri-state for visualization / consumers. */
export type OccupancyClass = 'unknown' | 'free' | 'occupied'

/**
 * Map a log-odds value to the tri-state classification. Cells within an
 * `epsilon` band around zero (or, by default, exactly zero) are `unknown`.
 */
export function classify(logOddsValue: number, epsilon = 1e-6): OccupancyClass {
	if (Math.abs(logOddsValue) < epsilon) return 'unknown'
	return logOddsValue > 0 ? 'occupied' : 'free'
}
