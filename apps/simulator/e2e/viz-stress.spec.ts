import { expect, test, type Page } from '@playwright/test'

import { setupConsoleGuard, teardownConsoleGuard } from './console-guard'
import { activateTab, launchSimulator } from './fixtures'
import { evaluateLeak, fitTrend, sampleHeap, type HeapSample } from './memory'
import {
	installLeakInstrument,
	sampleInstrument,
	type InstrumentSample,
} from './mount-stress'
import {
	evaluateVizStress,
	recordVizReport,
	VIZ_BUDGETS,
	VIZ_TOGGLES,
	writeVizMetrics,
	type VizStressReport,
	type VizToggle,
} from './viz-stress'

/**
 * Phase 11 — Visualization Toggle Stress.
 *
 * Goal (docs/e2e.md, Phase 11): make sure toggling layers does not leak or
 * crash. The doc's tasks and pass criteria are:
 *
 *   - Enable / disable lidar in a loop
 *   - Enable / disable occupancy grid in a loop
 *   - Enable / disable debug overlays in a loop
 *   - Enable / disable camera in a loop
 *   - Enable / disable helpers in a loop
 *   - Assert no crashes
 *   - Assert no memory growth
 *
 * Each round steps every visualization toggle off then back on through the
 * public UI (activate the tab the toggle lives in, click the button — the
 * store flips the flag, the renderer mounts / unmounts the layer). That is
 * precisely the React `useEffect` cleanup + Three.js geometry
 * alloc/dispose churn that a leak regression feeds on, and it is exactly what
 * a user does when exploring the app's overlays.
 *
 * ── Observable signals ──────────────────────────────────────────────────
 *
 * Two independent, observable mechanisms drive the verdict, the same pair
 * Phase 10's mount/unmount stress uses (each proving a different leak
 * surface):
 *
 *   1. Steady-state rAF / interval / listener counters (Phase 10's leak
 *      instrument, `installLeakInstrument` + `sampleInstrument`). A
 *      visualization layer that registers a window listener it never
 *      removes, or that adds an animation frame it never cancels, leaves the
 *      live count one higher every round — the lo-water mark climbs, the
 *      drift gate trips. (Phase 10 navigates the whole page away between
 *      samples so the instrument boots fresh each cycle; Phase 11 keeps the
 *      page alive across rounds, so the instrument must catch the steady-
 *      state creep *while the page persists* — exactly the leak shape a
 *      repeated toggle would actually feed.)
 *   2. Retained heap across the toggle soup (Phase 8's `sampleHeap` /
 *      `fitTrend` / `evaluateLeak`, reused verbatim). A leak that retains a
 *      geometry buffer or a listener closure each toggle shows up as a
 *      sustained upward slope over the rounds, with the same hard budgets.
 *
 * The Phase 6 console guard (installed in `beforeEach`) owns the
 * "no crashes" criterion for synthetic errors AND the failure mode specific
 * to this phase: toggling the `camera-toggle` recreates an R3F `<Canvas>`+
 * WebGL context every other round. R3F v9 calls `gl.forceContextLoss()` on
 * `<Canvas>` unmount, which dispatches `webglcontextlost` on the canvas and
 * THREE.js logs the debug message `THREE.WebGLRenderer: Context Lost.` — a
 * *benign, intentional* GPU-release signal (desirable tidy teardown, not a
 * regression). The guard was refined at Phase 11 to whitelist exactly that
 * probe-only `log`-level message (real context losses on a live canvas still
 * surface as `error`-level console messages — caught by the guard's
 * `console.error` rule — and through `webglcontextcreationerror`). Phase 11
 * keeps the camera in the cycle because the doc says so, and leans on the
 * tightened guard to fail hard if a *live* canvas ever loses its context.
 *
 * ── Duration / rounds ──────────────────────────────────────────────────
 *
 * The doc doesn't quote a duration for Phase 11. It reads "in a loop" — the
 * meaningful axis is the *number of toggle rounds*, not wall clock. Phases
 * 8 / 9 / 10 all make the long-running knob configurable via an env var and
 * default to a quick CI-friendly value, and Phase 11 mirrors that pattern:
 *
 *   - `E2E_VIZ_ROUNDS`              — how many full off/on cycles each toggle
 *                                     runs (default 3, a tractable CI gate;
 *                                     set higher e.g. nightly for a long
 *                                     soak that exposes a per-round leak).
 *   - `E2E_VIZ_TOGGLE_DELAY_MS`     — ms to settle between an off and an on
 *                                     click within a round (default 150, so
 *                                     R3F / the leak instrument actually see
 *                                     the mount/unmount complete before the
 *                                     next one starts). Defaulted short for
 *                                     CI; the canonical soak doesn't need to
 *                                     raise it).
 *
 * Like Phases 8 / 9 / 10, the test interacts only through the public UI —
 * keyboard-free: it switches tabs and clicks the toggle buttons the user
 * would click. It never touches store or simulation state directly.
 */

test.beforeEach(async ({ page }) => {
	// Install the leak instrument before the first mount so the very first
	// toggle's effect (cycle 0's baseline reading) is fully counted — same
	// ordering and idempotency trick Phase 10 uses.
	installLeakInstrument(page)
	setupConsoleGuard(page)
})
test.afterEach(async () => teardownConsoleGuard())

/** Default number of off/on rounds per toggle. Override with `E2E_VIZ_ROUNDS`
 *  for the canonical long soak. */
const DEFAULT_VIZ_ROUNDS = 3
/** Default settle between the off and on halves of a single round, in ms.
 *  Override with `E2E_VIZ_TOGGLE_DELAY_MS`. */
const DEFAULT_TOGGLE_DELAY_MS = 150

test.describe('Phase 11 — Visualization toggle stress', () => {
	test('cycle every visualization layer: no leak, no crash', async ({ page }, info) => {
		const rounds = Number.parseInt(process.env.E2E_VIZ_ROUNDS ?? `${DEFAULT_VIZ_ROUNDS}`, 10)
		expect(Number.isFinite(rounds) && rounds >= 1, 'E2E_VIZ_ROUNDS must be >= 1').toBe(true)
		const toggleDelayMs = Number.parseInt(
			process.env.E2E_VIZ_TOGGLE_DELAY_MS ?? `${DEFAULT_TOGGLE_DELAY_MS}`,
			10,
		)
		expect(
			Number.isFinite(toggleDelayMs) && toggleDelayMs >= 0,
			'E2E_VIZ_TOGGLE_DELAY_MS must be >= 0',
		).toBe(true)

		// Each round toggles six layers off then on, two tab switches per
		// toggle (3 tabs total) plus two-settles per toggle and a final settle.
		// In practice a round sits around 10s (the camera toggle recreates
		// an R3F `<Canvas>` + WebGL context, which is the slow part). Picking a
		// per-round budget of 12s gives reasonable headroom, and the fixed
		// overhead covers launch + warm-up + the trailing heap / instrument
		// samples — mirroring Phase 10's `30s per cycle + headroom` shape but
		// sized to this phase's actual per-round wall time.
		const perRoundBudgetMs = 12_000
		const fixedOverheadMs = 90_000
		test.setTimeout(perRoundBudgetMs * rounds + fixedOverheadMs)

		// ── open simulator ────────────────────────────────────────────────
		// "Open simulator" is implicit — every read above is gated on the
		// the public ready-contract every other phase uses.
		await launchSimulator(page)

		const t0 = Date.now()
		const cdp = await page.context().newCDPSession(page)

		// ── warm up: let first-frame + initial allocation settle ─────────
		// Same shape as Phase 8 / Phase 10: scene-graph upload, geometry cache
		// warm-up and the occupancy grid's initial cells land here; we don't
		// want them counted as leak growth. The leak instrument is live by
		// now (installed in beforeEach) so the baseline sample is honest.
		await page.waitForTimeout(3_000)

		const heapSamples: HeapSample[] = []
		const instrumentSamples: InstrumentSample[] = []
		heapSamples.push(await sampleHeap(page, t0, 0, cdp))
		instrumentSamples.push(await sampleInstrument(page, t0, 0))

		// ── toggle loop ──────────────────────────────────────────────────
		// Each round: for every visualization toggle, click it off (its layer
		// unmounts), settle, click it back on (its layer mounts again). Then
		// let the page settle a beat and snapshot both leak signals. The heap
		// trend across rounds catches retained-growth leaks; the counter drift
		// catches per-toggle handle leaks. Ending every layer ON keeps the
		// steady state stable between samples (the default user shape).
		for (let n = 1; n <= rounds; n++) {
			// Phase 11 tasks, one per toggle, grouped under the doc's five
			// headers ("lidar" / "occupancy grid" / "debug overlays" / "camera"
			// / "helpers") — see VIZ_TOGGLES for the explicit mapping.
			for (const toggle of VIZ_TOGGLES) {
				await cycleToggle(page, toggle, toggleDelayMs)
			}

			// Let the freshly-toggled scene settle to steady state before
			// reading the counters, so any rAF / interval pending at the
			// exact moment of the snapshot reflects the steady state the next
			// round will measure against.
			await page.waitForTimeout(500)

			heapSamples.push(await sampleHeap(page, t0, n, cdp))
			instrumentSamples.push(await sampleInstrument(page, t0, n))
		}

		// ── verdict ──────────────────────────────────────────────────────
		// The console guard (Phase 6) enforces no `console.error` / no
		// unhandled rejections / no genuine WebGL context loss on a *live*
		// canvas across the entire toggle soup — covering the "no crashes"
		// pass criterion. (As of Phase 11 the guard whitelists the benign
		// `THREE.WebGLRenderer: Context Lost.` debug log that R3F emits via
		// `gl.forceContextLoss()` when the camera `<Canvas>` is intentionally
		// unmounted; see console-guard.ts.) Here we add the toggle-stress
		// verdict: memory verdict + counter drift.
		const trend = fitTrend(heapSamples)
		const memVerdict = evaluateLeak(trend, VIZ_BUDGETS, Date.now() - t0)
		const stressed = evaluateVizStress(
			instrumentSamples,
			{ passed: memVerdict.passed, warnings: memVerdict.warnings },
			{ growthMb: trend.growthMb, slopeMbPerMin: trend.slopeMbPerMin, r2: trend.r2 },
		)

		const report: VizStressReport = {
			scenario: info.title,
			rounds,
			durationMs: Date.now() - t0,
			samples: instrumentSamples,
			baseline: stressed.baseline,
			maxDrift: stressed.maxDrift,
			growthMb: trend.growthMb,
			slopeMbPerMin: trend.slopeMbPerMin,
			r2: trend.r2,
			warnings: stressed.warnings,
			passed: stressed.passed,
			timestamp: new Date().toISOString(),
			ref: process.env.GITHUB_REF ?? null,
		}
		recordVizReport(report, info)

		// Assert the steady-state counters never drift above the lo-water-mark
		// baseline across the rounds — the doc's "no memory growth" criterion,
		// held against the per-registration live counts (a leak adding one
		// rAF chain / window listener per toggle makes the lo-water mark climb
		// every round, so the drift exceeds zero immediately). Each counter is
		// gated independently with a clear message naming the leak.
		expect(
			(stressed.maxDrift.rafLive ?? 0) <= 0,
			`Animation loops accumulate: the live rAF count's max − min drift is ` +
				`+${stressed.maxDrift.rafLive} across ${rounds} toggle rounds ` +
				`(steady-state min ${stressed.baseline.rafLive ?? '?'}). A visualization layer ` +
				`that abandons a pending rAF chain each toggle makes the lo-water mark climb by ` +
				`one every round. ` +
				`Warnings: ${stressed.warnings.join('; ') || 'none'}`,
		).toBe(true)

		expect(
			(stressed.maxDrift.intervalLive ?? 0) <= 0,
			`Intervals accumulate: the live setInterval count's max − min drift is ` +
				`+${stressed.maxDrift.intervalLive} across ${rounds} toggle rounds ` +
				`(steady-state min ${stressed.baseline.intervalLive ?? '?'}). A visualization ` +
				`layer registered an interval its unmount forgot to clear. ` +
				`Warnings: ${stressed.warnings.join('; ') || 'none'}`,
		).toBe(true)

		expect(
			(stressed.maxDrift.windowListeners ?? 0) <= 0,
			`window listeners accumulate: the live window-listener count's max − ` +
				`min drift is +${stressed.maxDrift.windowListeners} across ${rounds} ` +
				`toggle rounds (steady-state min ${stressed.baseline.windowListeners ?? '?'}). ` +
				`A window.removeEventListener hook is missing or removes from the wrong target. ` +
				`Warnings: ${stressed.warnings.join('; ') || 'none'}`,
		).toBe(true)

		expect(
			(stressed.maxDrift.documentListeners ?? 0) <= 0,
			`document listeners accumulate: the live document-listener count's max − ` +
				`min drift is +${stressed.maxDrift.documentListeners} across ${rounds} ` +
				`toggle rounds (steady-state min ${stressed.baseline.documentListeners ?? '?'}). ` +
				`A document.removeEventListener hook is missing. ` +
				`Warnings: ${stressed.warnings.join('; ') || 'none'}`,
		).toBe(true)

		// Assert memory growth stays below the hard budget — the doc's "no
		// memory growth" criterion. A leak that retains a geometry buffer /
		// listener closure each toggle shows up as a sustained upward slope
		// that fails either the growth cap or the leak-trend gate.
		expect(
			stressed.passed,
			`Visualization toggle stress failed over ${rounds} toggle rounds: ` +
				`growth=${report.growthMb != null ? report.growthMb.toFixed(1) : '?'}MB ` +
				`(budget ${VIZ_BUDGETS.maxGrowthMb}MB), ` +
				`slope=${report.slopeMbPerMin.toFixed(2)}MB/min ` +
				`(budget ${VIZ_BUDGETS.maxLeakMbPerMinute}MB/min, r²=${report.r2.toFixed(2)}). ` +
				`Warnings: ${stressed.warnings.join('; ') || 'none'}`,
		).toBe(true)
	})

	// Closing test: flush the accumulated viz-stress artifact. Declared last
	// so, under Playwright's in-order test execution, it lands rows produced
	// above on disk harmlessly whether run alone or after the stress test.
	test('flush viz metrics artifact', async () => {
		await writeVizMetrics()
	})
})

/** Click one visualization toggle off then back on through the public UI.
 *
 *  The toggle lives in `toggle.tab` of the right panel (Phase 2 of
 *  docs/hud.md moved the HUDs into tabbed panes — only the active tab's pane
 *  is visible), so we activate the tab first, then click the button twice
 *  with a settle between halves — so the layer actually unmounts and remounts
 *  (R3F / React commit the cleanup before the next effect runs). Ending ON
 *  keeps the default render shape the next round will measure against. */
async function cycleToggle(page: Page, toggle: VizToggle, settleMs: number) {
	await activateTab(page, toggle.tab)
	const button = page.getByTestId(toggle.testid)
	// Off — the layer unmounts.
	await button.click()
	await page.waitForTimeout(settleMs)
	// Back on — the layer re-mounts from scratch (the churn the doc stresses).
	await button.click()
	await page.waitForTimeout(settleMs)
}

