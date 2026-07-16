import { expect, type Page, test } from '@playwright/test'

import { setupConsoleGuard, teardownConsoleGuard } from './console-guard'
import { activateTab } from './fixtures'
import {
	evaluateLeak,
	fitTrend,
	type HeapSample,
	MEMORY_BUDGETS,
	type MemoryReport,
	recordMemoryReport,
	sampleHeap,
	writeMemoryMetrics,
} from './memory'
import { launchSimulatorForWorld, type Simulator, type WorldPos } from './simulator'

/**
 * Phase 8 — Memory Leak Test.
 *
 * Goal (docs/e2e.md, Phase 8): detect browser memory leaks over a long session.
 * The test runs a sustained "user" session — driving the robot, creating and
 * removing navigation goals, and cycling visualization overlays on and off —
 * while sampling the JS heap at regular intervals. It then asserts the
 * leak-shape verdict from the doc's pass criteria:
 *
 *   - memory stabilizes        → growth stays below `maxGrowthMb`
 *   - small growth is fine     → the budget is generous, not zero
 *   - continuous linear growth fails → a well-fitting upward slope fails
 *
 * Unlike Phase 7's soft/warn-only budgets, this is a **hard gate**: a leak
 * shape fails the test. Small retained growth (cache warm-up, occupancy cells,
 * path buffers) is expected and tolerated.
 *
 * Duration: the doc calls for 5–10 minutes. A literal 10-minute test is too
 * slow for the default CI run, so the session length is configurable via the
 * `E2E_MEMORY_DURATION_MS` env var with a default (~15s) that still exercises
 * a couple of drive / goal / overlay cycles and heap samples to surface a
 * real leak. Set the env var higher for the canonical long-run (e.g. nightly).
 *
 * The test interacts only through the public UI — keyboard for driving, world-
 * space clicks for goals, toggle buttons for overlays — never touching store
 * or simulation state directly, exactly like the earlier phases.
 *
 * The Phase 6 console guard (installed in `beforeEach`) enforces no
 * `console.error`, no unhandled rejections and no WebGL context loss across
 * the whole session — folding the "memory stabilizes" pass criterion together
 * with the baseline browser-stability requirement.
 */

test.beforeEach(async ({ page }) => setupConsoleGuard(page))
test.afterEach(async () => teardownConsoleGuard())

/** Default session length. Override with `E2E_MEMORY_DURATION_MS` for the
 *  canonical 5–10 minute long-run. The default is the CI-minimal value (see
 *  the "Stress tests on CI" doc): a short session still runs a couple of
 *  drive / goal / overlay cycles and produces enough heap samples for the
 *  leak-trend fit; raise the env var for the canonical soak. */
const DEFAULT_DURATION_MS = 15_000
/** How often (ms) we take a heap sample. Frequent enough to fit a slope,
 *  sparse enough not to starve the render loop. */
const SAMPLE_INTERVAL_MS = 5_000

/** Floor points the robot can actually reach, well clear of the arena walls
 *  and the HUD safe zones. Alternating them aims the robot around the room so
 *  the occupancy grid and path planner do real work each cycle. */
const GOAL_A: WorldPos = { x: 2, y: -1.5 }
const GOAL_B: WorldPos = { x: -2, y: 1.5 }

/** The full set of overlay toggles cycled each round. Each entry names the tab
 *  the toggle lives in (so we activate it first) and the testid — straight
 *  from docs/e2e.md ("roles / labels / data-testid"), no CSS selectors.
 *
 *  The **camera viewport** is intentionally *not* part of this cycle: it
 *  mounts its own WebGL canvas, and rapidly creating / destroying WebGL
 *  contexts every round makes headless Chromium lose the context. That is a
 *  Phase 9 (render-stability) concern — "No WebGL context loss" — not a memory
 *  leak, and the Phase 6 console guard fails hard on a context loss. The
 *  camera's single-mount resource lifecycle is already covered by Phase 4's
 *  `robot camera viewport renders` test, so Phase 8 focuses on the scene-graph
 *  overlays whose mount/unmount churn is what a *memory* leak is about (React
 *  disposable lifecycle, geometry buffers, occupancy cells, minimap redraw). */
type OverlayToggle = { tab: 'sensors' | 'map' | 'nav'; testid: string }
const OVERLAY_TOGGLES: OverlayToggle[] = [
	{ tab: 'sensors', testid: 'lidar-toggle' },
	{ tab: 'map', testid: 'occupancy-grid-toggle' },
	{ tab: 'map', testid: 'minimap-toggle' },
]

/** Toggle an overlay through the public UI: activate its tab and click it once.
 *  The store flips the flag and the renderer mounts / unmounts the layer —
 *  precisely the churn that stresses React resource lifecycle. */
async function toggleOverlay(page: Page, toggle: OverlayToggle) {
	await activateTab(page, toggle.tab)
	await page.getByTestId(toggle.testid).click()
}

/** Drive the robot for a short burst via the keyboard (real user input). */
async function driveBurst(page: Page, key: 'w' | 's' | 'a' | 'd', ms: number) {
	await page.keyboard.down(key)
	await page.waitForTimeout(ms)
	await page.keyboard.up(key)
}

/** Place a goal through a world-space click, then clear it through the Nav
 *  tab's `Clear goals` button — the same public affordance a user uses. */
async function placeAndClearGoal(sim: Simulator, page: Page, goal: WorldPos) {
	await sim.placeGoal(goal, { hudCollision: 'nudge', fallback: { x: 0, y: 0 } })
	// The robot starts driving toward the goal. Clearing immediately exercises
	// the cancel path and returns autonomy to manual, exactly the create /
	// remove cycle the doc asks for.
	await activateTab(page, 'nav')
	const clear = page.getByTestId('clear-goals-button')
	// Clear may be briefly disabled if the robot already reached the goal and
	// the queue emptied on its own; click only when enabled.
	await expect.poll(async () => await clear.isEnabled(), { timeout: 5_000 }).toBe(true)
	await clear.click()
	await expect(page.getByTestId('goal-count')).toHaveText('0')
}

test.describe('Phase 8 — Memory leak test', () => {
	test('long session: drive, goals and overlays do not leak memory', async ({ page }, info) => {
		// Headroom scales with the configured session so a raised env var doesn't
		// outrun the per-test timeout: launch + warm-up + the full session plus a
		// generous margin for the drive/goal/overlay interaction and teardown.
		const durationMs = Number.parseInt(
			process.env.E2E_MEMORY_DURATION_MS ?? `${DEFAULT_DURATION_MS}`,
			10,
		)
		expect(Number.isFinite(durationMs), 'E2E_MEMORY_DURATION_MS must be a number').toBe(true)
		test.setTimeout(durationMs + 60_000)

		// Open the simulator (Phase 8 task: "Open simulator").
		const sim = await launchSimulatorForWorld(page)

		// A single CDP session for forced GC between samples. Opened once here
		// rather than per sample so the session lifecycle itself does not churn
		// the heap the test is measuring.
		const cdp = await page.context().newCDPSession(page)

		// ── warm up: let initial allocation settle before the baseline sample ──
		// First-frame uploads, asset / geometry caches and the occupancy grid's
		// initial allocation all land here; we don't want them counted as leak
		// growth. The warm-up also lets the render loop reach steady state.
		await page.waitForTimeout(3_000)

		// ── sampling loop ───────────────────────────────────────────────────
		// Each round drives the robot, runs a create/remove goal cycle, and
		// flips every overlay off then on again (so layers end ON — the default
		// user shape). A heap sample is taken at the top of each round, so the
		// number of samples scales with the configured duration.
		const t0 = Date.now()
		const samples: HeapSample[] = []
		let round = 0
		let nextGoal: WorldPos = GOAL_A

		// The first sample is the baseline; the loop below appends the rest.
		samples.push(await sampleHeap(page, t0, 0, cdp))

		while (Date.now() - t0 < durationMs) {
			// Drive the robot a little each round (Phase 8: "periodically drive").
			await driveBurst(page, 'w', 600)

			// Create + remove a goal each round (Phase 8: "periodically create /
			// remove goals"). Alternate the target so the planner / grid do work.
			await placeAndClearGoal(sim, page, nextGoal)
			nextGoal = nextGoal === GOAL_A ? GOAL_B : GOAL_A

			// Cycle every overlay off then back on each round (Phase 8: "periodically
			// toggle overlays"). Ending ON keeps the default render shape for the next
			// sample so readings aren't skewed by an off-state settling. These are
			// all scene-graph / DOM overlays (see OVERLAY_TOGGLES): toggling them
			// exercises the React resource-lifecycle churn a leak test must cover
			// without touching WebGL context creation.
			//
			// NOTE: with the CI-minimal default the loop may only run once or twice;
			// that is intentional — a leak shape shows up in the very first cycle
			// and the heap trend across even two samples is enough to flag growth.
			for (const toggle of OVERLAY_TOGGLES) {
				await toggleOverlay(page, toggle) // off
			}
			for (const toggle of OVERLAY_TOGGLES) {
				await toggleOverlay(page, toggle) // back on
			}

			// Keep the simulation running so the render loop and autonomy
			// controller stay live between rounds; the heap majority is allocated
			// there, not in the short interaction bursts above.
			if (Date.now() - t0 < durationMs) {
				await page.waitForTimeout(SAMPLE_INTERVAL_MS)
			}

			round++
			samples.push(await sampleHeap(page, t0, round, cdp))
		}

		// ── verdict ──────────────────────────────────────────────────────────
		// The console guard (Phase 6) already enforces no errors / rejections /
		// WebGL context loss across this whole session — a stability requirement
		// the doc folds into "memory stabilizes". Here we add the leak verdict.
		const trend = fitTrend(samples)
		const { passed, warnings } = evaluateLeak(trend, MEMORY_BUDGETS, Date.now() - t0)

		const report: MemoryReport = {
			scenario: info.title,
			durationMs: Date.now() - t0,
			slopeMbPerMin: trend.slopeMbPerMin,
			r2: trend.r2,
			firstMb: trend.firstMb,
			lastMb: trend.lastMb,
			growthMb: trend.growthMb,
			samples,
			warnings,
			passed,
			timestamp: new Date().toISOString(),
			ref: process.env.GITHUB_REF ?? null,
		}
		recordMemoryReport(report, info)

		// The doc's pass criteria are the test's pass criteria. A degenerate
		// series (heap API unavailable the whole run) is reported as a warning
		// rather than a false failure — evaluateLeak returns passed=true then.
		expect(
			passed,
			`Memory leak detected over a ${report.durationMs}ms session: ` +
				`growth=${report.growthMb != null ? report.growthMb.toFixed(1) : '?'}MB ` +
				`(budget ${MEMORY_BUDGETS.maxGrowthMb}MB), ` +
				`slope=${report.slopeMbPerMin.toFixed(2)}MB/min ` +
				`(budget ${MEMORY_BUDGETS.maxLeakMbPerMinute}MB/min, r²=${report.r2.toFixed(2)}). ` +
				`Warnings: ${warnings.join('; ') || 'none'}`,
		).toBe(true)
	})

	// Closing test: flush the accumulated memory artifact. Declared last so,
	// under Playwright's in-order test execution, it lands rows produced above
	// on disk harmlessly whether run alone or after the session test.
	test('flush memory metrics artifact', async () => {
		await writeMemoryMetrics()
	})
})
