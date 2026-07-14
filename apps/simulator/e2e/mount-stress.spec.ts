import { expect, test } from '@playwright/test'

import { setupConsoleGuard, teardownConsoleGuard } from './console-guard'
import { launchSimulator } from './fixtures'
import { evaluateLeak, fitTrend, sampleHeap, type HeapSample } from './memory'
import {
	evaluateMount,
	installLeakInstrument,
	MOUNT_BUDGETS,
	recordMountReport,
	sampleInstrument,
	writeMountMetrics,
	type InstrumentSample,
	type MountStressReport,
} from './mount-stress'

/**
 * Phase 10 — Mount / unmount stress.
 *
 * Goal (docs/e2e.md, Phase 10): catch React resource leaks when the scene is
 * torn down. The doc's tasks and pass criteria are:
 *
 *   - Open simulator
 *   - Leave page
 *   - Return to page
 *   - Repeat 30–50 times
 *   - Assert no increasing memory
 *   - Assert no duplicate event listeners
 *   - Assert no additional animation loops
 *
 * Each cycle performs a *real navigation* away from `/` (to `about:blank`) and
 * back — the exact user action "leave page / return to page". A full navigation
 * tears the whole React / R3F tree *and the JS context* down, then rebuilds
 * them on return, which is precisely the mount/unmount churn the doc wants to
 * stress.
 *
 * ── Observable signals ──────────────────────────────────────────────────
 *
 * Two independent, observable mechanisms drive the verdict, neither touching
 * simulation state:
 *
 *   1. Steady-state counters. The leak-instrument (installed by
 *      `addInitScript`, ./mount-stress.ts) wraps `requestAnimationFrame`,
 *      `setInterval` and `window`/`document` event listeners with count-tracking
 *      shims. Because the instrument and the app both re-run on every
 *      navigation, each cycle reads the *steady-state* live count after the
 *      fresh mount settles. The doc's "no duplicate listeners / no additional
 *      animation loops" criteria become "every cycle settles to the same
 *      steady-state count as the lo-water-mark baseline" — the gate is the
 *      drift of each counter's max above its min across cycles, since noise
 *      can only push a value *above* the steady state and a leak that adds
 *      one handle per mount makes the lo-water mark climb by exactly one each
 *      cycle, so max − min exceeds the tolerance immediately.
 *
 *   2. Retained heap across navigations. The "no increasing memory" criterion
 *      reuses Phase 8's GC-accurate heap sampling. A retained-across-loads leak
 *      (e.g. an unreleased WebGL context keeping scene geometry alive through
 *      the browser's own resource cache) shows up as a sustained upward slope
 *      over the cycles, evaluated with the same hard budgets as Phase 8.
 *
 * The Phase 6 console guard (installed in `beforeEach`) owns "no WebGL context
 * loss" and "no unhandled exceptions" across the whole run — folding the
 * browser-stability side of Phase 10 in the same way it does for Phases 8/9.
 *
 * Duration: the doc calls for 30–50 repeats. A literal 40-cycle run is
 * tractable but slow, and CI should not block on it by default. The cycle
 * count is configurable via the `E2E_MOUNT_COUNT` env var with a default of 1
 * — enough for the steady-state drift gate to raise any per-cycle
 * regression (a leaked handle makes the lo-water mark climb on the very
 * first remount, so the max − min drift exceeds the tolerance immediately).
 * Set the env var to 30–50 for the canonical long stress (e.g. nightly). This
 * mirrors Phase 8's `E2E_MEMORY_DURATION_MS` and Phase 9's
 * `E2E_RENDER_DURATION_MS` pattern.
 *
 * The test interacts only through the public UI path a user takes: it navigates
 * the browser, and on each return waits for the simulator's own ready
 * signals (`fps-counter`, `robot-marker`, HUD) via the same `launchSimulator`
 * helper every other phase uses. It never touches store or simulation state
 * directly.
 */

test.beforeEach(async ({ page }) => {
	// Install the leak instrument before any navigation so the very first mount
	// (cycle 0's baseline reading) is fully counted.
	installLeakInstrument(page)
	setupConsoleGuard(page)
})
test.afterEach(async () => teardownConsoleGuard())

/** Default cycle count. Override with `E2E_MOUNT_COUNT` for the canonical
 *  30–50-cycle long-run. The default is the CI-minimal value (see the "Stress
 *  tests on CI" doc): one remount is enough for the steady-state drift gate —
 *  a leaked handle climbs the lo-water mark on the very first remount; raise
 *  the env var for the canonical long stress. */
const DEFAULT_MOUNT_COUNT = 1

test.describe('Phase 10 — Mount / unmount stress', () => {
	test('repeat leave/return: no leaked rAF, intervals or listeners', async ({ page }, info) => {
		const cycles = Number.parseInt(process.env.E2E_MOUNT_COUNT ?? `${DEFAULT_MOUNT_COUNT}`, 10)
		expect(Number.isFinite(cycles) && cycles >= 1, 'E2E_MOUNT_COUNT must be >= 1').toBe(true)
		// 30s per cycle is the real worst case (cold mount + navigation timeout).
		// Headroom for teardown + sampling is added on top.
		const perCycleBudgetMs = 30_000
		const iterationCount = cycles + 1 /* baseline mount */
		test.setTimeout(perCycleBudgetMs * iterationCount + 30_000)

		// ── baseline mount (cycle 0) ──────────────────────────────────────
		// "Open simulator". Uses the same public ready-helper every phase uses,
		// so the ready-contract is read once and reused on every return.
		await launchSimulator(page)

		const t0 = Date.now()
		const cdp = await page.context().newCDPSession(page)

		// Let first-frame allocation settle, identical to Phase 8, so the
		// baseline heap sample is steady-state retained heap — not cold-start.
		await page.waitForTimeout(3_000)

		const heapSamples: HeapSample[] = []
		const instrumentSamples: InstrumentSample[] = []
		heapSamples.push(await sampleHeap(page, t0, 0, cdp))
		instrumentSamples.push(await sampleInstrument(page, t0, 0))

		// ── leave / return loop ──────────────────────────────────────────
		// Each iteration: leave to about:blank (real navigation — the user
		// navigated away), return to / (real navigation — the user came back),
		// wait for the simulator to be ready, then snapshot both signals.
		// Stacks onto cycle 0 above so the per-sample `i` matches the leave
		// round and the final samples count == cycles + 1 (the doc's "repeat
		// 30–50 times" reads naturally: 30 navigations away & back).
		for (let n = 1; n <= cycles; n++) {
			// "Leave page": navigate away from the app. about:blank is the
			// canonical empty page — tearing the whole React + R3F tree down
			// with it. Using a real navigation (not a same-page JS nudge)
			// exercises the exact unmount path a tab close / navigation does.
			await page.goto('about:blank')

			// "Return to page": navigate back to the simulator. The full React
			// tree, R3F canvas, sim loop, sensors, grid and HUD all mount again
			// from scratch — exactly the remount churn Phase 10 wants to stress.
			await launchSimulator(page)

			// Let the freshly-remounted tree settle to steady state before
			// reading the counters, so a slow-clearing interval during teardown
			// of the prior cycle and a still-mounting cycle's new interval
			// don't both credit to this cycle's reading.
			await page.waitForTimeout(1_000)

			heapSamples.push(await sampleHeap(page, t0, n, cdp))
			instrumentSamples.push(await sampleInstrument(page, t0, n))
		}

		// ── verdict ──────────────────────────────────────────────────────
		// The console guard (Phase 6) already enforces no errors / rejections /
		// WebGL context loss across the whole leave/return stress — covering
		// the browser-stability side of Phase 10. Here we add the mount-stress
		// verdict: counter drift (teardown leaks) + the memory verdict.
		const trend = fitTrend(heapSamples)
		// Phase 10 owns its own budgets (mirroring Phase 8's verbatim) so the
		// mount/unmount verdict stays self-contained — the leak-evaluation logic
		// is the same reused Phase 8 helper, but the thresholds are Phase 10's.
		const memVerdict = evaluateLeak(trend, MOUNT_BUDGETS, Date.now() - t0)
		const mount = evaluateMount(
			instrumentSamples,
			{ passed: memVerdict.passed, warnings: memVerdict.warnings },
			{ growthMb: trend.growthMb, slopeMbPerMin: trend.slopeMbPerMin, r2: trend.r2 },
		)

		const report: MountStressReport = {
			scenario: info.title,
			cycles,
			durationMs: Date.now() - t0,
			samples: instrumentSamples,
			baseline: mount.baseline,
			maxDrift: mount.maxDrift,
			growthMb: trend.growthMb,
			slopeMbPerMin: trend.slopeMbPerMin,
			r2: trend.r2,
			warnings: mount.warnings,
			passed: mount.passed,
			timestamp: new Date().toISOString(),
			ref: process.env.GITHUB_REF ?? null,
		}
		recordMountReport(report, info)

		// Assert the steady-state counters never drift above the lo-water-mark
		// baseline across the cycles — the doc's "no duplicate / no additional"
		// criteria. The lo-water mark is the cleanest steady-state proxy (noise
		// can only push a value above it), and a leak that adds one handle per
		// mount makes the lo-water mark climb by one each cycle, so max − min
		// exceeds the tolerance immediately. Each counter is gated independently
		// with a clear message naming the leak.
		expect(
			(mount.maxDrift.rafLive ?? 0) <= 0,
			`Animation loops accumulate: the live rAF count's max − min drift is ` +
				`+${mount.maxDrift.rafLive} across ${cycles} leave/return cycles ` +
				`(steady-state min ${mount.baseline.rafLive ?? '?'}). A teardown bug that ` +
				`abandons a pending rAF chain each mount, or registers an additional one ` +
				`per mount, makes the lo-water mark climb by one every cycle. ` +
				`Warnings: ${mount.warnings.join('; ') || 'none'}`,
		).toBe(true)

		expect(
			(mount.maxDrift.intervalLive ?? 0) <= 0,
			`Intervals accumulate: the live setInterval count's max − min drift is ` +
				`+${mount.maxDrift.intervalLive} across ${cycles} leave/return cycles ` +
				`(steady-state min ${mount.baseline.intervalLive ?? '?'}). A teardown ` +
				`clearInterval hook is missing — the sim loop / FpsCounter interval is not ` +
				`fully torn down on demount. ` +
				`Warnings: ${mount.warnings.join('; ') || 'none'}`,
		).toBe(true)

		expect(
			(mount.maxDrift.windowListeners ?? 0) <= 0,
			`window listeners accumulate: the live window-listener count's max − min ` +
				`drift is +${mount.maxDrift.windowListeners} across ${cycles} ` +
				`leave/return cycles (steady-state min ${mount.baseline.windowListeners ?? '?'}). ` +
				`A window.removeEventListener hook is missing or removes from the wrong target. ` +
				`Warnings: ${mount.warnings.join('; ') || 'none'}`,
		).toBe(true)

		expect(
			(mount.maxDrift.documentListeners ?? 0) <= 0,
			`document listeners accumulate: the live document-listener count's max − ` +
				`min drift is +${mount.maxDrift.documentListeners} across ${cycles} ` +
				`leave/return cycles (steady-state min ${mount.baseline.documentListeners ?? '?'}). ` +
				`A document.removeEventListener hook is missing or removes from the wrong target. ` +
				`Warnings: ${mount.warnings.join('; ') || 'none'}`,
		).toBe(true)

		// Assert memory growth stays below the hard budget — the doc's "no
		// increasing memory" criterion. A retained-across-navigations leak (e.g.
		// an unreleased WebGL context keeping scene geometry alive through the
		// browser's resource cache) shows up here as a sustained upward slope that
		// fails either the growth cap or the leak-trend gate. The thresholds here
		// are Phase 10's own (`MOUNT_BUDGETS`, mirroring Phase 8's verbatim).
		expect(
			mount.passed,
			`Mount stress failed over ${cycles} leave/return cycles: ` +
				`growth=${report.growthMb != null ? report.growthMb.toFixed(1) : '?'}MB ` +
				`(budget ${MOUNT_BUDGETS.maxGrowthMb}MB), ` +
				`slope=${report.slopeMbPerMin.toFixed(2)}MB/min ` +
				`(budget ${MOUNT_BUDGETS.maxLeakMbPerMinute}MB/min, r²=${report.r2.toFixed(2)}). ` +
				`Warnings: ${mount.warnings.join('; ') || 'none'}`,
		).toBe(true)
	})

	// Closing test: flush the accumulated mount-stress artifact. Declared last
	// so, under Playwright's in-order test execution, it lands rows produced
	// above on disk harmlessly whether run alone or after the stress test.
	test('flush mount metrics artifact', async () => {
		await writeMountMetrics()
	})
})
