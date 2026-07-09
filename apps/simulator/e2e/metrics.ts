// Phase 7 — Performance budgets: measurement helpers.
//
// Goal (docs/e2e.md, Phase 7): detect *major* performance regressions rather
// than micro-optimize. Every metric here is a soft budget — a breach emits a
// `console.warn`, records a `warn: true` flag in the JSON artifact, and is
// surfaced in the Playwright report via `test.info().annotations`, but it never
// fails the test. Phase 13 is the phase that promotes these into hard gates.
//
// Recorded metrics:
//   - startup time:    wall clock from `page.goto` until the first non-zero
//                      FPS readout is visible (i.e. the render loop produced a
//                      frame and the app is interactive).
//   - fps sanity:      post-startup sustained FPS sampled once per second over
//                      a short window, reduced to the median.
//   - frame time (ms): derived from the same rAF window as 1000 / fps.
//   - js heap (MB):    `Performance.measureUserAgentSpecificMemory` when
//                      available, falling back to `performance.memory
//                      .usedJSHeapSize` (Chrome exposes it; the CI target is
//                      headless Chromium, which is exactly where it ships).
//
// Artifacts: `e2e/.results/perf-metrics.json` is (re-)written from the
// runner's module-scope registry after the spec finishes, accumulating one
// entry per recorded scenario so a run can trend many metrics. See
// `./performance.spec.ts`.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page, TestInfo } from '@playwright/test'

/**
 * Resource path *relative to the simulator app* (Playwright's `cwd` is the app
 * dir). Kept as a single constant so the writer (which uses an absolute path)
 * and the CI artifact matcher in `.github/workflows/e2e.yml` agree on location.
 */
export const PERF_ARTIFACT = 'e2e/.results/perf-metrics.json'

/** Soft budgets. Breaches warn loudly but never fail a test. */
export const BUDGETS = {
	// Time-to-first-frame: anything under 10s is fine for a Three.js apps cold
	// start in CI; warn above 15s so a regression is obvious in the report.
	startupMs: { warn: 15_000 },
	// A sustained median below 30 FPS means the render loop is sick; warn
	// below 25. Headless Chromium in CI on a beefy runner should clear this.
	fps: { warnBelow: 25 },
	// Frame time: ~33ms is 30fps; warn above 40ms (steady-state < 25fps).
	frameMs: { warn: 40 },
	// JS heap: the app is light; warn above ~256MB (leaves headroom for the
	// long-run memory-leak test in Phase 8 to own the real ceiling).
	heapMb: { warn: 256 },
} as const

export type PerfMetric = {
	scenario: string
	startupMs: number | null
	fpsMedian: number | null
	frameMsMedian: number | null
	heapMb: number | null
	warnings: string[]
	/** ISO timestamp so artifact rows are trendable across CI runs. */
	timestamp: string
	/** CI-friendly git ref when available (passed via env). */
	ref: string | null
}

/** Module-scope registry, flushed once after the perf spec by `writeMetrics()`. */
const samples: PerfMetric[] = []

/** Record a measured metric row and surface it on the Playwright report. */
export function recordMetric(metric: PerfMetric, info: TestInfo): PerfMetric {
	samples.push(metric)
	info.attach('perf-metric.json', {
		body: JSON.stringify(metric, null, 2),
		contentType: 'application/json',
	})
	info.annotations.push(
		{
			type: `startup ${metric.startupMs?.toFixed(0) ?? '?'}ms`,
			description:
				metric.startupMs != null && metric.startupMs > BUDGETS.startupMs.warn
					? 'WARN: startup over budget'
					: 'ok',
		},
		{
			type: `fps ${metric.fpsMedian?.toFixed(0) ?? '?'}`,
			description:
				metric.fpsMedian != null && metric.fpsMedian < BUDGETS.fps.warnBelow
					? 'WARN: fps below budget'
					: 'ok',
		},
		{
			type: `frame ${metric.frameMsMedian?.toFixed(0) ?? '?'}ms`,
			description:
				metric.frameMsMedian != null && metric.frameMsMedian > BUDGETS.frameMs.warn
					? 'WARN: frame time over budget'
					: 'ok',
		},
		{
			type: `heap ${metric.heapMb?.toFixed(0) ?? '?'}MB`,
			description:
				metric.heapMb != null && metric.heapMb > BUDGETS.heapMb.warn
					? 'WARN: heap over budget'
					: 'ok',
		},
	)
	// Emitted to the runner's stdout so it is visible in CI logs without
	// polluting the app's browser console (which the guard watches).
	for (const w of metric.warnings) console.warn(`[perf] ${metric.scenario}: ${w}`)
	return metric
}

/** Append a new metric row to the JSON artifact. Reads the current contents
 *  first so repeated runs (playwright retries, multiple projects) append rather
 *  than clobber; ordering is preserved for trending. */
export async function writeMetrics(): Promise<void> {
	const target = artifactPath()
	const existing = await readArtifact()
	const merged = [...existing, ...samples]
	await mkdir(dirname(target), { recursive: true })
	await writeFile(target, `${JSON.stringify(merged, null, 2)}\n`)
}

/** Cheap, concurrent-safe JSON read (empty array if the artifact does not exist yet). */
async function readArtifact(): Promise<PerfMetric[]> {
	try {
		const raw = await readFile(artifactPath(), 'utf8')
		return JSON.parse(raw) ?? []
	} catch {
		return []
	}
}

/**
 * Resolve the artifact path absolutely. `import.meta.url` points at this file
 * (`apps/simulator/e2e/metrics.ts`); `dirname(import.meta.url)` is therefore
 * `apps/simulator/e2e`, and `PERF_ARTIFACT` (`e2e/.results/...`) is *relative to
 * the app dir*, so we strip the leading `e2e/` to land the file at
 * `apps/simulator/e2e/.results/perf-metrics.json`.
 */
function artifactPath(): string {
	const here = dirname(fileURLToPath(import.meta.url))
	return `${here}/${PERF_ARTIFACT.replace(/^e2e\//, '')}`
}

/**
 * Measure startup time: from the moment navigation is kicked off (call this
 * right before `page.goto`) until the first non-zero FPS readout is visible.
 * Returns the wall-clock time in ms, or null if the FPS readout never appeared
 * (caller should assert that separately so a missing readout is its own
 * observable failure rather than a perf number).
 */
export async function measureStartup(
	page: Page,
	base: string = '/',
	timeoutMs = 30_000,
): Promise<number | null> {
	const t0 = Date.now()
	await page.goto(base)
	try {
		await page
			.getByTestId('fps-counter')
			.filter({ hasText: /FPS: [1-9]/ })
			.waitFor({ state: 'visible', timeout: timeoutMs })
		return Date.now() - t0
	} catch {
		return null
	}
}

/**
 * Sample FPS over a window by polling the HUD readout once per second, then
 * reduce to the median. FPS is already reported by the in-app `FpsCounter`
 * (~1Hz), so polling the visible readout avoids re-implementing frame timing in
 * the browser and keeps the helper a pure *reader* (it touches no sim state).
 *
 * Returns `{ fps, frameMs }` medians, or nulls when the readout wasn't parseable
 * often enough to trust a median.
 */
export async function sampleFps(
	page: Page,
	windowSeconds = 5,
): Promise<{ fpsMedian: number | null; frameMsMedian: number | null }> {
	const tickMs = 250
	const ticks = Math.max(4, Math.round((windowSeconds * 1000) / tickMs))
	const fps: number[] = []
	for (let i = 0; i < ticks; i++) {
		const text = await page.getByTestId('fps-counter').textContent()
		const m = text?.match(/FPS:\s*(-?\d+)/)
		if (m) {
			const n = Number.parseInt(m?.[1] ?? '-1', 10)
			if (Number.isFinite(n) && n >= 0) fps.push(n)
		}
		await page.waitForTimeout(tickMs)
	}
	if (fps.length < 3) return { fpsMedian: null, frameMsMedian: null }
	const median = (xs: number[]): number => {
		const s = [...xs].sort((a, b) => a - b)
		const mid = Math.floor(s.length / 2)
		return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
	}
	const fpsMedian = median(fps)
	// frame time = 1000 / fps (only meaningful when fps > 0).
	const frameMsMedian = fpsMedian > 0 ? 1000 / fpsMedian : null
	return { fpsMedian, frameMsMedian }
}

/**
 * Measure JS heap usage (MB). Prefers the cross-origin `Performance.
 * measureUserAgentSpecificMemory` which grants a real, GC-aware number; falls
 * back to `performance.memory.usedJSHeapSize` which headless Chromium exposes
 * (the CI default target). Returns null if neither API is available — the
 * phasing is "detect major regressions", so a missing API is a transparent gap,
 * not a failed test.
 */
export async function measureHeap(page: Page): Promise<number | null> {
	const mb = await page.evaluate(async () => {
		const p = performance as Performance & {
			measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>
			memory?: { usedJSHeapSize: number }
		}
		if (typeof p.measureUserAgentSpecificMemory === 'function') {
			try {
				const m = await p.measureUserAgentSpecificMemory()
				return m.bytes / (1024 * 1024)
			} catch {
				/* fall through */
			}
		}
		if (p.memory && typeof p.memory.usedJSHeapSize === 'number') {
			return p.memory.usedJSHeapSize / (1024 * 1024)
		}
		return null
	})
	return mb
}

/**
 * Soft-budget check. Appends a human-readable string only on breach; never
 * throws. Phase 13 is what flips these into hard failures.
 */
export function warnIfOverBudget(
	value: number | null,
	budget: number,
	name: string,
	scenario: string,
	warnings: string[],
) {
	if (value == null) return
	if (value > budget)
		warnings.push(`${scenario}: ${name} ${value.toFixed(1)} over soft budget ${budget}`)
}

/**
 * Higher-is-better variant (EPS): warn when a value falls *below* the floor.
 */
export function warnIfBelowBudget(
	value: number | null,
	floor: number,
	name: string,
	scenario: string,
	warnings: string[],
) {
	if (value == null) return
	if (value < floor)
		warnings.push(`${scenario}: ${name} ${value.toFixed(1)} below soft budget ${floor}`)
}
