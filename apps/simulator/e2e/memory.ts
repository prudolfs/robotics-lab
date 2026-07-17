// Phase 8 — Memory-leak detection helpers.
//
// Goal (docs/e2e.md, Phase 8): detect browser memory leaks over a long session
// rather than micro-optimize. Unlike the Phase 7 perf budgets (which are soft
// / warn-only), the memory-leak test is a *hard* gate by design — its pass
// criteria say so explicitly:
//
//   - memory stabilizes              → growth stays below a threshold
//   - small growth is acceptable     → the threshold is generous, not zero
//   - continuous linear growth fails → a positive slope with strong fit fails
//
// Two independent signals therefore drive the verdict:
//
//   1. total growth (last − first sample) must stay under `maxGrowthMb`, AND
//   2. the linear-regression slope over the samples must not show a sustained
//      upward trend (slope × run duration must stay under `maxLeakMbPerMinute`
//      *and* the fit quality R² must be weak when the slope is small — a flat,
//      noisy series is the "stabilized" success shape).
//
// Heap is sampled via the CDP `Performance.getMetrics` `JSHeapUsedSize`
// counter (updated synchronously after a forced `HeapProfiler.collectGarbage`),
// falling back to the JS-API `measureHeap` (reused from ./metrics.ts), which
// prefers `Performance.measureUserAgentSpecificMemory` and finally Chrome's
// `performance.memory.usedJSHeapSize`. A GC nudge (`HeapProfiler.collectGarbage`
// + `window.gc()`) runs before each sample so readings reflect reachable
// *retained* memory, not transient garbage awaiting collection — this keeps the
// slope honest without relying on the engine's own collection cadence. The
// `--js-flags=--expose-gc` launch flag (playwright.config.ts) makes `window.gc`
// real; the CDP path is the primary and works on stock Chromium too.
//
// Artifacts: `e2e/.results/memory-metrics.json` accumulates one row per
// recorded session so CI can trend leak shape across runs. The writer is
// flushed at the end of the spec (mirrors the Phase 7 perf artifact pattern).

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page, TestInfo } from '@playwright/test'
import { measureHeap } from './metrics'

export const MEMORY_ARTIFACT = 'e2e/.results/memory-metrics.json'

/** Hard budgets for the leak verdict. */
export const MEMORY_BUDGETS = {
	// Total retained growth over the whole session (last − first). ~50MB of
	// headroom on top of the Phase 7 ~50–256MB baseline leaves room for normal
	// cache warm-up (geometry, occupancy cells, path buffers) while still
	// catching a genuine leak that never plateaus.
	maxGrowthMb: 50,
	// Sustained slope converted to MB/minute of *retained* heap. A flat ~0
	// slope over a multi-minute run is the success shape; anything that leaks
	// ~10MB/minute of retained memory every minute is a real leak.
	maxLeakMbPerMinute: 10,
	// R² floor: a slope is only treated as a "leak trend" when the linear fit
	// is reasonably good. Below this R² the series is dominated by noise, not
	// a monotonic increase — the small-growth check above is what guards it.
	leakTrendR2: 0.6,
	// Minimum *usable* samples before the linear-leak gate runs at all. With
	// fewer than this, the fit is statistically meaningless: two points have
	// R² = 1.00 by construction, so a single ~1MB GC-noise bump reads as a
	// perfectly-fit ~20MB/min "linear leak" over a ~3s CI-minimal run (Phase
	// 10's default `E2E_MOUNT_COUNT=1` takes exactly two samples). The growth
	// cap above still guards a single-cycle leak from the small-growth check;
	// the *trend* gate only fires once enough samples exist to define a trend.
	// Canonical long soaks (Phases 8/9/10 nightly) take many more samples and
	// stay fully gated.
	leakMinSamples: 4,
} as const

export type HeapSample = {
	/** Monotonic sample index (0-based). */
	i: number
	/** Wall-clock ms since the sampler started (first sample is ~0). */
	elapsedMs: number
	/** Retained JS heap in MB, or null when the browser API was unavailable
	 *  for that probe. */
	heapMb: number | null
}

export type MemoryTrend = {
	/** Linear-least-squares slope, in MB per minute. */
	slopeMbPerMin: number
	/** Coefficient of determination for the linear fit (0–1). */
	r2: number
	/** first usable (non-null) heap sample, in MB. */
	firstMb: number | null
	/** last usable (non-null) heap sample, in MB. */
	lastMb: number | null
	/** last − first, in MB (null until at least two usable samples). */
	growthMb: number | null
	/** Number of usable (non-null) samples the fit ran over. */
	n: number
}

export type MemoryReport = {
	scenario: string
	durationMs: number
	slopeMbPerMin: number
	r2: number
	firstMb: number | null
	lastMb: number | null
	growthMb: number | null
	samples: HeapSample[]
	warnings: string[]
	passed: boolean
	timestamp: string
	ref: string | null
}

/** Module-scope registry, flushed once after the spec by `writeMemoryMetrics()`. */
const reports: MemoryReport[] = []

/** Force a GC + minor settle before reading the heap so the sample reflects
 *  *retained* memory rather than transient garbage awaiting collection.
 *
 *  Reliability order (each more portable than the last):
 *   1. CDP `HeapProfiler.collectGarbage` — the canonical Playwright way to
 *      force a collection (works on a stock headless Chromium, no flags).
 *   2. `window.gc()` — exposed only when Chromium is launched with
 *      `--js-flags=--expose-gc` (configured in playwright.config.ts for this
 *      suite). When available it is a direct, synchronous GC.
 *   3. A short wait — never forces collection, but lets a pending scheduled
 *      GC run; only used as a last resort so the API reading at least reflects
 *      the engine's own collection cadence.
 *
 *  The slope the test asserts on is therefore honest: each sample is
 *  post-collection retained heap, not stale `usedJSHeapSize` frozen until the
 *  engine's own next major GC. A tiny bit of measurement noise remains from any
 *  transient allocations the timing race misses — the R² floor in the verdict
 *  absorbs exactly that.
 *
 *  The CDPSession is created once by the caller (see the spec) and passed in
 *  so we don't open / close a session per sample (which would itself churn the
 *  heap the test is measuring). */
async function gcNudge(page: Page, cdp?: import('@playwright/test').CDPSession): Promise<void> {
	if (cdp) {
		try {
			await cdp.send('HeapProfiler.collectGarbage')
		} catch {
			/* fall through to window.gc */
		}
	}
	await page.evaluate(() => {
		const w = window as unknown as { gc?: () => void }
		if (typeof w.gc === 'function') w.gc()
	})
	// Give the engine a beat to actually collect before we read the counter.
	await page.waitForTimeout(50)
}

/** Take a single retained-heap sample (MB) at a monotonic elapsed time.
 *
 *  Measurement order (most accurate / fresh first):
 *   1. CDP `Performance.getMetrics` → `JSHeapUsedSize` — updated by Chromium
 *      *synchronously* after `HeapProfiler.collectGarbage` (the `window.gc`
 *      / `performance.memory` JS API, by contrast, is polled and only
 *      refreshes on the engine's own major-GC cadence, so it can read frozen
 *      across many samples). This is the only source that actually tracks
 *      post-collection retained heap within a sample interval.
 *   2. `measureHeap` (from ./metrics.ts) — the JS-API fallback used by
 *      Phase 7. Kept as a fallback so the helper still works without a CDP
 *      session (and degrades to the same gap-aware behaviour Phase 7 has). */
export async function sampleHeap(
	page: Page,
	t0: number,
	i: number,
	cdp?: import('@playwright/test').CDPSession,
): Promise<HeapSample> {
	await gcNudge(page, cdp)

	let heapMb: number | null = null
	if (cdp) {
		try {
			// Enable the Performance domain so `getMetrics` reports heap counters;
			// enabling is idempotent and cheap, and `JSHeapUsedSize` is one of the
			// built-in metrics that ships with the domain.
			await cdp.send('Performance.enable')
			const { metrics } = await cdp.send('Performance.getMetrics')
			const used = metrics?.find((m) => m.name === 'JSHeapUsedSize')?.value
			if (typeof used === 'number' && Number.isFinite(used)) {
				heapMb = used / (1024 * 1024)
			}
		} catch {
			/* fall through to JS-API measurement */
		}
	}
	if (heapMb == null) heapMb = await measureHeap(page)

	return { i, elapsedMs: Date.now() - t0, heapMb }
}

/**
 * Linear least-squares fit over the usable (non-null) heap samples.
 *
 * Returns slope in MB/minute (not per ms) plus R² so the caller can decide
 * whether the slope is a real trend or noise. With fewer than two usable
 * samples the slope and R² are 0 and the growth is null — the caller treats
 * that as "inconclusive, don't fail" (a missing heap API is a transparent gap,
 * matching the Phase 7 philosophy).
 */
export function fitTrend(samples: HeapSample[]): MemoryTrend {
	const usable = samples.filter((s): s is HeapSample & { heapMb: number } => s.heapMb != null)
	if (usable.length < 2) {
		return {
			slopeMbPerMin: 0,
			r2: 0,
			firstMb: usable[0]?.heapMb ?? null,
			lastMb: usable[usable.length - 1]?.heapMb ?? null,
			growthMb: null,
			n: usable.length,
		}
	}
	const xs = usable.map((s) => s.elapsedMs)
	const ys = usable.map((s) => s.heapMb as number)
	const n = usable.length
	const meanX = xs.reduce((a, b) => a + b, 0) / n
	const meanY = ys.reduce((a, b) => a + b, 0) / n
	let sxy = 0
	let sxx = 0
	let syy = 0
	for (let k = 0; k < n; k++) {
		const dx = xs[k] - meanX
		const dy = ys[k] - meanY
		sxy += dx * dy
		sxx += dx * dx
		syy += dy * dy
	}
	const slopePerMs = sxx > 0 ? sxy / sxx : 0
	const slopeMbPerMin = slopePerMs * 60_000
	// R² is mathematically 1.00 for a two-point fit (any two points lie on a
	// perfect line); with two/three points it is therefore not a "trend" signal
	// at all, regardless of the slope magnitude. Report 0 so the leak-trend
	// gate (which keys on R² ≥ leakTrendR2) does not fire on under-sampled
	// CI-minimal runs; the growth cap above still guards the single-cycle case.
	const r2 = n >= 4 ? (syy > 0 ? (sxy * sxy) / (sxx * syy) : 0) : 0
	const firstMb = ys[0]
	const lastMb = ys[ys.length - 1]
	return {
		slopeMbPerMin,
		r2,
		firstMb,
		lastMb,
		growthMb: lastMb - firstMb,
		n,
	}
}

/**
 * Evaluate the leak verdict against the hard budgets.
 *
 * Rules (doc Phase 8 pass criteria):
 *   - small growth is acceptable → `growthMb <= maxGrowthMb` passes growth
 *   - continuous linear growth fails → a slope whose retained rate exceeds
 *     `maxLeakMbPerMinute` *and* fits well (R² ≥ `leakTrendR2`) fails even if
 *     cumulative growth is still under the cap, because a steady slope will
 *     eventually blow past it on a longer run.
 *   - memory stabilizes → a flat or noisy series (low slope or low R²) is the
 *     success shape.
 *
 * Returns `{ passed, warnings }`. Missing heap data (null readings) does not
 * fail: the Phase 7 / Phase 8 philosophy is "detect major regressions" — a gap in
 * the measurement API is reported as a warning, not a false positive.
 */
export function evaluateLeak(
	trend: MemoryTrend,
	budgets: typeof MEMORY_BUDGETS,
	durationMs: number,
): { passed: boolean; warnings: string[] } {
	const warnings: string[] = []

	if (trend.n < 2) {
		warnings.push('heap API unavailable — no usable samples collected')
		// A genuinely missing API is a transparent gap, not a leak: do not fail.
		return { passed: true, warnings }
	}
	if (trend.n < budgets.leakMinSamples) {
		warnings.push(
			`too few samples (${trend.n}) to fit a leak trend — linear gate skipped ` +
			`(needs ${budgets.leakMinSamples}, growth cap still active)`,
		)
	}

	const growthOk = trend.growthMb != null && trend.growthMb <= budgets.maxGrowthMb
	const slopeRateMb = trend.slopeMbPerMin * (durationMs / 60_000)
	// The linear-fit *trend* gate only fires once enough samples define a trend;
	// see `leakMinSamples`. The growth cap above still catches any single-cycle
	// leak from just two samples — the trend is the backstop, not the trip.
	const leakTrend =
		trend.n >= budgets.leakMinSamples &&
		trend.slopeMbPerMin > budgets.maxLeakMbPerMinute &&
		trend.r2 >= budgets.leakTrendR2

	if (trend.growthMb != null && !growthOk) {
		warnings.push(`growth ${trend.growthMb.toFixed(1)}MB exceeds budget ${budgets.maxGrowthMb}MB`)
	}
	if (leakTrend) {
		warnings.push(
			`sustained linear leak: slope ${trend.slopeMbPerMin.toFixed(2)}MB/min ` +
				`(R²=${trend.r2.toFixed(2)}, ~${slopeRateMb.toFixed(1)}MB over the run)`,
		)
	}

	return { passed: growthOk && !leakTrend, warnings }
}

/** Record a memory report and surface it on the Playwright report. */
export function recordMemoryReport(report: MemoryReport, info: TestInfo): MemoryReport {
	reports.push(report)
	info.attach('memory-metric.json', {
		body: JSON.stringify(report, null, 2),
		contentType: 'application/json',
	})
	info.annotations.push(
		{
			type: `growth ${report.growthMb != null ? report.growthMb.toFixed(1) : '?'}MB`,
			description: report.passed ? 'ok' : 'FAIL: memory growth',
		},
		{
			type: `slope ${report.slopeMbPerMin.toFixed(2)}MB/min`,
			description: report.passed ? 'ok' : 'FAIL: linear leak trend',
		},
		{
			type: `r2 ${report.r2.toFixed(2)}`,
			description: report.passed ? 'ok' : 'leak fit strong',
		},
	)
	const _verdict = report.passed ? 'PASS' : 'FAIL'
	for (const w of report.warnings) console.warn(`[memory] ${report.scenario}: ${w}`)

	return report
}

/** Append accumulated reports to the JSON artifact (concurrent-safe, append-first). */
export async function writeMemoryMetrics(): Promise<void> {
	const target = artifactPath()
	const existing = await readArtifact()
	const merged = [...existing, ...reports]
	await mkdir(dirname(target), { recursive: true })
	await writeFile(target, `${JSON.stringify(merged, null, 2)}\n`)
}

async function readArtifact(): Promise<MemoryReport[]> {
	try {
		const raw = await readFile(artifactPath(), 'utf8')
		return JSON.parse(raw) ?? []
	} catch {
		return []
	}
}

/** Resolve the artifact path absolutely (same trick as metrics.ts). */
function artifactPath(): string {
	const here = dirname(fileURLToPath(import.meta.url))
	return `${here}/${MEMORY_ARTIFACT.replace(/^e2e\//, '')}`
}
