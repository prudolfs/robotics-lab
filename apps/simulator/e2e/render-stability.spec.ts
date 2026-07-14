import { expect, test, type Page } from '@playwright/test'

import { setupConsoleGuard, teardownConsoleGuard } from './console-guard'
import { getSimTime, launchSimulator } from './fixtures'
import {
	RENDER_ARTIFACT,
	type RenderReport,
	type RenderSample,
	recordRenderReport,
	writeRenderMetrics,
} from './render-stability'

/**
 * Phase 9 — Render Stability.
 *
 * Goal (docs/e2e.md, Phase 9): guarantee the app stays responsive during a
 * long run. The doc lists the canonical duration as 15 minutes and the pass
 * criteria as:
 *
 *   - application stays responsive
 *   - no WebGL context loss
 *   - no crashes
 *   - no unhandled exceptions
 *
 * Unlike Phase 8 (which proves *memory* doesn't leak), Phase 9 proves *the
 * render loop and browser context stay alive* — the app keeps producing frames,
 * the simulation clock keeps advancing, and the renderer's WebGL context is
 * never lost over a sustained run. The bulk of the pass criteria is owned by
 * the Phase 6 console guard (installed in `beforeEach`): it fails hard on
 * `console.error`, unhandled promise rejections, and any `WebGL … context`
 * console message. This spec layers a periodic *liveness* probe — FPS > 0 and
 * clock advancing — on top, because the console guard only catches explicit
 * errors. A render loop that quietly stalls without emitting anything (a
 * frozen rAF, a busy main thread) is a stability regression the doc calls out
 * as "application stays responsive", and that is what the sensors here measure.
 *
 * A "crash" (the renderer / worker / page going away) is caught implicitly:
 * any subsequent `page.*` call rejects, surfacing as a test failure. There is
 * deliberately no explicit "the page crashed" probe — if the page goes away,
 * the next liveness poll throws, exactly like a user would see a dead tab.
 *
 * Duration: the doc calls for 15 minutes. A literal 15-minute test is too slow
 * for the default CI run, so the session length is configurable via the
 * `E2E_RENDER_DURATION_MS` env var with a default (~15s) that still exercises
 * enough liveness probes to surface a real stall. Set the env var higher for
 * the canonical long-run (e.g. nightly). This mirrors Phase 8's
 * `E2E_MEMORY_DURATION_MS` pattern exactly.
 *
 * The test interacts only through the public UI — it simply launches the
 * simulator and lets it run, polling the HUD readouts (fps-counter, sim-time)
 * that the app already exposes for the user. It never touches store or
 * simulation state directly.
 */

test.beforeEach(async ({ page }) => setupConsoleGuard(page))
test.afterEach(async () => teardownConsoleGuard())

/** Default session length. Override with `E2E_RENDER_DURATION_MS` for the
 *  canonical 15-minute long-run. The default is the CI-minimal value (see
 *  the "Stress tests on CI" doc): a short run still produces enough
 *  liveness probes to catch a stalled render loop; raise the env var for the
 *  canonical soak. */
const DEFAULT_DURATION_MS = 15_000
/** How often (ms) we take a liveness sample. Frequent enough to catch a stall
 *  well within the canonical duration, sparse enough not to starve the render
 *  loop we are measuring. */
const SAMPLE_INTERVAL_MS = 5_000

test.describe('Phase 9 — Render stability', () => {
	test('long run: render loop and WebGL context stay alive', async ({ page }, info) => {
		// Headroom scales with the configured session so a raised env var doesn't
		// outrun the per-test timeout: launch + warm-up + the full session plus a
		// generous margin for sampling and teardown.
		const durationMs = Number.parseInt(
			process.env.E2E_RENDER_DURATION_MS ?? `${DEFAULT_DURATION_MS}`,
			10,
		)
		expect(Number.isFinite(durationMs), 'E2E_RENDER_DURATION_MS must be a number').toBe(true)
		test.setTimeout(durationMs + 30_000)

		// Open the simulator (Phase 9 task: "Run simulation for 15 minutes").
		// We simply launch and let it run — the application under test is the
		// default idle-simulating shape a user sees on load.
		await launchSimulator(page)

		// Confirm the rendering pipeline produced at least one frame before we
		// start measuring liveness; the launcher already waits for FPS > 0, but
		// reading it again here pins a baseline sample for the report.
		const t0 = Date.now()
		const samples: RenderSample[] = []

		// ── liveness loop ────────────────────────────────────────────────────
		// Each round reads FPS and the simulation clock. A non-zero FPS means
		// the rAF-driven render loop is alive; an advancing clock means the
		// fixed-step integrator is running. The two together are exactly the
		// doc's "application stays responsive" criterion, broken down into two
		// observable signals rather than one hand-wavy check.
		let round = 0
		samples.push(await sampleLiveness(page, t0, round))

		while (Date.now() - t0 < durationMs) {
			if (Date.now() - t0 < durationMs) {
				await page.waitForTimeout(SAMPLE_INTERVAL_MS)
			}
			round++
			samples.push(await sampleLiveness(page, t0, round))
		}

		// ── verdict ──────────────────────────────────────────────────────────
		// The console guard (Phase 6) already enforces no errors / rejections /
		// WebGL context loss across this whole session — covering the doc's
		// "no WebGL context loss", "no crashes", and "no unhandled exceptions"
		// pass criteria with one mechanism. Here we add the *responsiveness*
		// verdict: every sample must show a live render loop (FPS > 0) and an
		// advancing clock over the run.
		const report = evaluateReport({
			scenario: info.title,
			durationMs: Date.now() - t0,
			samples,
			timestamp: new Date().toISOString(),
			ref: process.env.GITHUB_REF ?? null,
		})
		recordRenderReport(report, info)

		// A responsive app shows a non-zero FPS on every probe (the FpsCounter
		// in the rendering package drives continuous invalidation, so a zero
		// reading means the rAF loop stalled — a real stability regression).
		const stalled = report.samples.filter((s) => (s.fps ?? 0) <= 0)
		expect(
			stalled.length === 0,
			`Render loop stalled on ${stalled.length} of ${report.samples.length} samples ` +
				`(FPS read 0 at rounds ${stalled.map((s) => s.i).join(', ') || 'none'}). ` +
				`Warnings: ${report.warnings.join('; ') || 'none'}`,
		).toBe(true)

		// The end-to-end verdict flag also folds in any warnings the evaluator
		// raised (missing readouts, clock not advancing), so a regression that
		// flips either signal fails the run even when FPS itself stayed > 0.
		expect(
			report.passed,
			`Render stability check failed over a ${report.durationMs}ms session. ` +
				`Warnings: ${report.warnings.join('; ') || 'none'}`,
		).toBe(true)
	})

	// Closing test: flush the accumulated render-stability artifact. Declared
	// last so, under Playwright's in-order test execution, it lands rows produced
	// above on disk harmlessly whether run alone or after the session test.
	test('flush render metrics artifact', async () => {
		await writeRenderMetrics()
	})
})

/** A single liveness probe: parse FPS and sim-clock from the HUD readouts.
 *
 *  Reads only the readouts the app already exposes (`fps-counter`, `sim-time`),
 *  never touching simulation state directly — exactly the user-facing path.
 *  Returns nulls when a readout wasn't parseable so the evaluator can downgrade
 *  that round to a warning rather than throw mid-run (a transient parse gap is
 *  not the regression we are looking for; a stalled loop is).
 */
async function sampleLiveness(page: Page, t0: number, i: number): Promise<RenderSample> {
	const fpsText = await page.getByTestId('fps-counter').textContent()
	const fpsMatch = fpsText?.match(/FPS:\s*(-?\d+)/)
	const fps = fpsMatch ? Number.parseInt(fpsMatch[1], 10) : null

	const clock = await readClock(page)

	return {
		i,
		elapsedMs: Date.now() - t0,
		fps: fps != null && Number.isFinite(fps) ? fps : null,
		simTime: clock,
	}
}

/** Read the simulation clock (seconds) from the HUD `sim-time` readout.
 *
 *  Accepts both the modern footer form (`SIM_TIME: HH:MM:SS.cc`) and the legacy
 *  `Sim time: 1.42s` form, mirroring `fixtures.getSimTime` but tolerant of a
 *  transiently empty readout (returns null instead of throwing) so a single
 *  unparseable probe degrades to a warning, not a mid-run test abort.
 */
async function readClock(page: Page): Promise<number | null> {
	const text = await page.getByTestId('sim-time').textContent()
	if (text == null) return null
	const clock = text.match(/SIM_TIME:\s*(\d+):(\d+):(\d+)\.(\d+)/)
	if (clock) {
		const hh = Number(clock[1])
		const mm = Number(clock[2])
		const ss = Number(clock[3])
		const cc = Number(clock[4])
		return hh * 3600 + mm * 60 + ss + cc / 100
	}
	const legacy = text.match(/Sim time:\s*([0-9.]+)/)
	return legacy ? Number.parseFloat(legacy[1]) : null
}

/** Combine the liveness samples into the report + pass verdict.
 *
 *  Verdict rules (doc Phase 9 pass criteria):
 *   - "application stays responsive" → every sample shows FPS > 0,
 *     *and* the sim clock advances between the first and last usable samples
 *     (a frozen clock with a live render loop would still be a regression:
 *     the integrator stopped even though the page paints).
 *   - "no WebGL context loss" / "no crashes" / "no unhandled exceptions" →
 *     owned by the Phase 6 console guard. A page crash surfaces as a rejected
 *     `page.*` call in the sampling loop and fails the test before this
 *     evaluator runs.
 *
 *  Missing readouts are reported as warnings (the measurement API gap is a
 *  transparent gap, matching Phase 7 / Phase 8 philosophy), never as a false
 *  failure — unless they constitute a *responsiveness* signal (zero FPS, or a
 *  non-advancing clock), in which case the spec's assertions above already
 *  flipped the test to FAIL.
 */
function evaluateReport(input: {
	scenario: string
	durationMs: number
	samples: RenderSample[]
	timestamp: string
	ref: string | null
}): RenderReport {
	const warnings: string[] = []
	const usableFps = input.samples.filter((s) => s.fps != null) as (RenderSample & {
		fps: number
	})[]
	const usableClock = input.samples.filter((s) => s.simTime != null) as (RenderSample & {
		simTime: number
	})[]

	if (usableFps.length === 0) warnings.push('FPS readout never parseable — render liveness unverified')
	if (usableClock.length === 0) warnings.push('sim-time readout never parseable — clock liveness unverified')

	const firstClock = usableClock.length > 0 ? usableClock[0].simTime : null
	const lastClock = usableClock.length > 0 ? usableClock[usableClock.length - 1].simTime : null
	const clockAdvanced =
		firstClock != null && lastClock != null ? lastClock > firstClock : null
	if (clockAdvanced === false) {
		warnings.push(`sim clock did not advance over the run (${firstClock}s → ${lastClock}s)`)
	}

	// The passed flag combines the two observable liveness signals: no stalled
	// samples (FPS > 0 everywhere) and an advancing clock. Missing readouts
	// (warnings only) never flip this false on their own.
	const stalled = input.samples.filter((s) => (s.fps ?? 0) <= 0)
	const passed = stalled.length === 0 && clockAdvanced !== false

	return {
		scenario: input.scenario,
		durationMs: input.durationMs,
		samples: input.samples,
		fpsMin: usableFps.length > 0 ? Math.min(...usableFps.map((s) => s.fps)) : null,
		fpsMedian: usableFps.length > 0 ? median(usableFps.map((s) => s.fps)) : null,
		fpsMax: usableFps.length > 0 ? Math.max(...usableFps.map((s) => s.fps)) : null,
		clockFirst: firstClock,
		clockLast: lastClock,
		clockAdvanced,
		warnings,
		passed,
		timestamp: input.timestamp,
		ref: input.ref,
	}
}

function median(xs: number[]): number {
	if (xs.length === 0) return 0
	const s = [...xs].sort((a, b) => a - b)
	const mid = Math.floor(s.length / 2)
	return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}
