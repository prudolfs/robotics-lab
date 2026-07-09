import { test } from '@playwright/test'

import { setupConsoleGuard, teardownConsoleGuard } from './console-guard'
import {
	BUDGETS,
	measureHeap,
	measureStartup,
	type PerfMetric,
	recordMetric,
	sampleFps,
	warnIfBelowBudget,
	warnIfOverBudget,
	writeMetrics,
} from './metrics'

/**
 * Phase 7 — Performance budgets.
 *
 * Goal: detect major performance regressions rather than micro-optimize.
 * This spec launches the simulator cold and measures four metrics, all under
 * *soft* budgets:
 *
 *   - startup time       — wall clock until the first non-zero FPS readout
 *   - FPS sanity         — sustained median over a short window
 *   - frame time (ms)    — 1000 / FPS, the inverse sanity check
 *   - JS heap size (MB)  — Chrome heap snapshot at a settled moment
 *
 * Breaches are recorded (test annotations + `perf-metric.json` attachment) and
 * echoed to stdout as warnings, but they do NOT fail the build. Phase 13 is
 * responsible for promoting these into hard gates once baselines are stable.
 *
 * The metrics artifact (`e2e/.results/perf-metrics.json`) is written by the
 * closing test so it lands on disk regardless of run ordering; Playwright
 * uploads the whole `e2e/.results` directory as a CI artifact (see the
 * `.github/workflows/e2e.yml` change in this commit).
 */

test.beforeEach(async ({ page }) => setupConsoleGuard(page))
test.afterEach(async () => teardownConsoleGuard())

test.describe('Phase 7 — Performance budgets', () => {
	test('startup, FPS, frame time and heap stay within soft budgets', async ({ page }, info) => {
		// ── startup ─────────────────────────────────────────────────────────
		// measureStartup issues `page.goto` itself and stops the clock at the
		// first non-zero FPS readout, so it owns the cold-start boundary rather
		// than launchSimulator (which would add untracked work before the timer).
		const startupMs = await measureStartup(page, '/', 30_000)
		// A *missing* readout is an observable wiring failure (the render loop
		// never produced a frame) — that belongs to the smoke suite's coverage
		// and stays as a hard assertion. A *slow* readout is a perf number, so
		// only its magnitude is budget-soft.
		test.expect(startupMs, 'startup FPS readout should appear').not.toBeNull()

		// The measurement already waited for the HUD signals launchSimulator
		// checks; assert them here too so this spec is self-contained.
		await page.getByTestId('simulator-hud').waitFor({ state: 'visible' })
		await page.getByTestId('robot-marker').waitFor({ state: 'attached' })

		// Let the scene warm up (assets, geometries, first rAF-driven work)
		// before sampling, so the FPS/heap numbers reflect steady state rather
		// than first-time GPU upload spikes.
		await page.waitForTimeout(1500)

		// ── FPS + frame time ────────────────────────────────────────────────
		const { fpsMedian, frameMsMedian } = await sampleFps(page, 6)

		// ── heap ───────────────────────────────────────────────────────────
		const heapMb = await measureHeap(page)

		// ── soft budget evaluation (warn-only — never throw) ───────────────
		const scenario = info.title
		const warnings: string[] = []
		warnIfOverBudget(startupMs, BUDGETS.startupMs.warn, 'startupMs', scenario, warnings)
		warnIfBelowBudget(fpsMedian, BUDGETS.fps.warnBelow, 'fps', scenario, warnings)
		warnIfOverBudget(frameMsMedian, BUDGETS.frameMs.warn, 'frameMs', scenario, warnings)
		warnIfOverBudget(heapMb, BUDGETS.heapMb.warn, 'heapMb', scenario, warnings)

		// ── record + report ────────────────────────────────────────────────
		const metric: PerfMetric = {
			scenario,
			startupMs,
			fpsMedian,
			frameMsMedian,
			heapMb,
			warnings,
			timestamp: new Date().toISOString(),
			ref: process.env.GITHUB_REF ?? null,
		}
		recordMetric(metric, info)
	})

	// Closing test: write the accumulated metrics artifact. Declared last so,
	// under Playwright's in-order test execution, it conveniently flushes rows
	// produced by the measurement test above. It is also harmless if run alone
	// (it just records whatever samples exist so far, possibly none).
	test('flush metrics artifact', async () => {
		await writeMetrics()
	})
})
