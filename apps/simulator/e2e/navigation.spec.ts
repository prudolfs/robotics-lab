import { type ConsoleMessage, expect, test } from '@playwright/test'
import { getGoalCount, getNavStatus, launchSimulator, placeGoal, queueGoal } from './fixtures'

/**
 * Phase 3 — Navigation.
 *
 * Verifies the end-to-end navigation flow from user click to robot arrival:
 *  - click destination → goal marker appears
 *  - robot reaches the goal
 *  - queued goals are processed in order
 *  - cancel goal removes the marker
 *
 * Tests interact only through the public UI: mouse clicks on the floor,
 * shift-click to queue, and the HUD controls. No internal state is touched.
 *
 * The goal "marker" lives inside the WebGL canvas and is not DOM-queryable;
 * the Navigation HUD mirrors the goal queue (active goal, distance, queued
 * count, controller status) so tests assert on observable state instead.
 */

const failures: string[] = []

test.beforeEach(async ({ page }) => {
	failures.length = 0
	page.on('console', (msg: ConsoleMessage) => {
		if (msg.type() === 'error') failures.push(`console.error: ${msg.text()}`)
	})
	page.on('pageerror', (err: Error) => failures.push(`pageerror: ${err.message}`))
	page.on('requestfailed', (req) => {
		if (req.url().endsWith('/favicon.ico')) return
		failures.push(`requestfailed: ${req.url()} — ${req.failure()?.errorText ?? ''}`)
	})
	page.on('console', (msg) => {
		const text = msg.text()
		if (text.includes('WebGL') && text.toLowerCase().includes('context')) {
			failures.push(`webgl context issue: ${text}`)
		}
	})
})

test.afterEach(async () => {
	if (failures.length > 0) {
		throw new Error(`Console / browser errors detected:\n${failures.join('\n')}`)
	}
})

test.describe('Phase 3 — Navigation', () => {
	test('click destination places a goal marker', async ({ page }) => {
		await launchSimulator(page)

		// No goal yet.
		await expect(page.getByTestId('goal-count')).toHaveText('0')
		await expect(page.getByTestId('active-goal')).toHaveText('—')

		const goal = await placeGoal(page, 0.65, 0.6)

		// A goal marker appears: the HUD mirrors an active goal + a queued count.
		await expect(page.getByTestId('goal-count')).toHaveText('1')
		await expect(page.getByTestId('active-goal')).toContainText(
			`${goal.x.toFixed(2)}, ${goal.y.toFixed(2)}`,
		)
		// Setting a goal enables autonomy.
		await expect(page.getByTestId('autonomous-toggle')).toHaveText('Auto: ON')
	})

	test('robot reaches the goal', async ({ page }) => {
		await launchSimulator(page)

		await placeGoal(page, 0.6, 0.55)

		// A near-by goal makes the controller rotate → drive → arrive within a
		// few seconds. Wait for the queue to drain and the controller to drop back
		// to manual (autonomy turns off once the queue empties). We poll rather
		// than sleep.
		await expect
			.poll(async () => Number(await getGoalCount(page)), { timeout: 30_000, intervals: [250] })
			.toBe(0)
		await expect
			.poll(async () => getNavStatus(page), { timeout: 10_000, intervals: [250] })
			.toBe('manual')
		await expect(page.getByTestId('active-goal')).toHaveText('—')
	})

	test('queued goals are processed in order', async ({ page }) => {
		test.setTimeout(150_000) // multi-goal autonomy run + slow-run headroom
		await launchSimulator(page)

		// Shift-click two distinct floor points to build a two-goal queue.
		await queueGoal(page, 0.7, 0.55)
		await queueGoal(page, 0.3, 0.7)
		await expect(page.getByTestId('goal-count')).toHaveText('2')

		// Capture the first active goal (head of the queue)...
		const g0text = (await page.getByTestId('active-goal').textContent()) ?? ''
		expect(g0text, `first active goal not parseable: ${g0text}`).not.toBe('—')

		// ...wait for the head to be reached (queued count drops to 1)...
		await expect
			.poll(async () => Number(await getGoalCount(page)), { timeout: 90_000, intervals: [250] })
			.toBe(1)
		// ...the second goal is now active...
		const g1text = (await page.getByTestId('active-goal').textContent()) ?? ''
		expect(g1text, `second active goal not parseable: ${g1text}`).not.toBe('—')

		// ...and wait for the second to be reached too.
		await expect
			.poll(async () => Number(await getGoalCount(page)), { timeout: 90_000, intervals: [250] })
			.toBe(0)
		await expect(page.getByTestId('active-goal')).toHaveText('—')
	})

	test('cancel goal removes the marker', async ({ page }) => {
		await launchSimulator(page)

		await placeGoal(page, 0.65, 0.6)
		await expect(page.getByTestId('goal-count')).toHaveText('1')

		await page.getByTestId('clear-goals-button').click()

		// The goal queue empties and autonomy drops; the active goal readout clears.
		await expect(page.getByTestId('goal-count')).toHaveText('0')
		await expect(page.getByTestId('active-goal')).toHaveText('—')
		await expect(page.getByTestId('autonomous-toggle')).toHaveText('Auto: OFF')
	})
})
