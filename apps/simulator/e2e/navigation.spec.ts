import { expect, test } from '@playwright/test'
import { setupConsoleGuard, teardownConsoleGuard } from './console-guard'
import { launchSimulatorForWorld, type Simulator } from './simulator'

/**
 * Phase 3 — Navigation.
 *
 * Verifies the end-to-end navigation flow from user click to robot arrival:
 *  - click destination → goal marker appears
 *  - robot reaches the goal
 *  - queued goals are processed in order
 *  - cancel goal removes the marker
 *
 * Tests interact only through the public UI: clicks on the floor and the HUD
 * controls. No internal state is touched. Critically, clicks are expressed in
 * *world* coordinates (metres), not canvas pixels — see docs/e2e-world-click.md.
 * The simulator's own renderer projects world → screen, and the E2E fixture
 * rejects clicks that would land under a HUD so a goal is never silently lost.
 *
 * The goal "marker" lives inside the WebGL canvas and is not DOM-queryable;
 * the Navigation HUD mirrors the goal queue (active goal, distance, queued
 * count, controller status) so tests assert on observable state instead.
 */

test.beforeEach(async ({ page }) => setupConsoleGuard(page))
test.afterEach(async () => teardownConsoleGuard())

/** A goal on clear floor (no HUD overlap) and well inside the arena walls.
 *  Reused across the navigation scenarios. Kept away from the ±4 m border so
 *  the controller has margin to settle without nudging the boundary. */
const CLEAR_GOAL = { x: 2, y: -1.5 }
/** A second goal, geometrically distinct from `CLEAR_GOAL`, also HUD-clear. */
const CLEAR_GOAL_2 = { x: -2, y: 1.5 }

test.describe('Phase 3 — Navigation', () => {
	test('click destination places a goal marker', async ({ page }) => {
		const sim: Simulator = await launchSimulatorForWorld(page)

		// No goal yet.
		await expect(page.getByTestId('goal-count')).toHaveText('0')
		await expect(page.getByTestId('active-goal')).toHaveText('—')

		const goal = await sim.placeGoal(CLEAR_GOAL)

		// A goal marker appears: the HUD mirrors an active goal + a queued count.
		await expect(page.getByTestId('goal-count')).toHaveText('1')
		await expect(page.getByTestId('active-goal')).toContainText(
			`${goal.x.toFixed(2)}, ${goal.y.toFixed(2)}`,
		)
		// Setting a goal enables autonomy.
		await expect(page.getByTestId('autonomous-toggle')).toHaveText('Auto: ON')
	})

	test('robot reaches the goal', async ({ page }) => {
		const sim = await launchSimulatorForWorld(page)

		// A nearby goal makes the controller rotate → drive → arrive within a
		// few seconds. Wait for the queue to drain and the controller to drop
		// back to manual (autonomy turns off once the queue empties).
		await sim.placeGoal({ x: 2, y: -1.5 })
		await sim.waitForGoalReached(30_000)
	})

	test('queued goals are processed in order', async ({ page }) => {
		test.setTimeout(150_000) // multi-goal autonomy run + slow-run headroom
		const sim = await launchSimulatorForWorld(page)

		// Queue two distinct floor points: the second must not start until the
		// first is reached.
		await sim.queueGoal(CLEAR_GOAL)
		await sim.queueGoal(CLEAR_GOAL_2)
		await expect(page.getByTestId('goal-count')).toHaveText('2')

		// Capture the first active goal (head of the queue)...
		const g0text = (await page.getByTestId('active-goal').textContent()) ?? ''
		expect(g0text, `first active goal not parseable: ${g0text}`).not.toBe('—')

		// ...wait for the head to be reached (queued count drops to 1)...
		await expect
			.poll(async () => await sim.goalCount(), { timeout: 90_000, intervals: [250] })
			.toBe(1)
		// ...the second goal is now active...
		const g1text = (await page.getByTestId('active-goal').textContent()) ?? ''
		expect(g1text, `second active goal not parseable: ${g1text}`).not.toBe('—')

		// ...and wait for the second to be reached too.
		await expect
			.poll(async () => await sim.goalCount(), { timeout: 90_000, intervals: [250] })
			.toBe(0)
		await expect(page.getByTestId('active-goal')).toHaveText('—')
	})

	test('cancel goal removes the marker', async ({ page }) => {
		const sim = await launchSimulatorForWorld(page)

		await sim.placeGoal(CLEAR_GOAL)
		await expect(page.getByTestId('goal-count')).toHaveText('1')

		await page.getByTestId('clear-goals-button').click()

		// The goal queue empties and autonomy drops; the active goal readout clears.
		await expect(page.getByTestId('goal-count')).toHaveText('0')
		await expect(page.getByTestId('active-goal')).toHaveText('—')
		await expect(page.getByTestId('autonomous-toggle')).toHaveText('Auto: OFF')
	})
})
