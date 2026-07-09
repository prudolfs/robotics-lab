import { expect, test } from '@playwright/test'
import { setupConsoleGuard, teardownConsoleGuard } from './console-guard'
import { activateTab, launchSimulator, resetWorld } from './fixtures'
import { launchSimulatorForWorld, type Simulator } from './simulator'

/**
 * Phase 6 — Console & Error Hygiene.
 *
 * Every existing E2E scenario already carries the shared console guard.
 * This spec proactively exercises multiple subsystems (lifecycle, navigation,
 * occupancy grid, sensors) in sequence and asserts the guard never reports
 * any violation.
 */

test.beforeEach(async ({ page }) => setupConsoleGuard(page))
test.afterEach(async () => teardownConsoleGuard())

test.describe('Phase 6 — Console & Error Hygiene', () => {
	test('no console.error after full startup', async ({ page }) => {
		await launchSimulator(page)
		// Console guard is silent on success.
	})

	test('no errors through pause / resume / reset cycle', async ({ page }) => {
		await launchSimulator(page)
		await page.getByTestId('pause-resume-button').click()
		await expect(page.getByTestId('pause-resume-button')).toHaveText('Resume')
		await page.getByTestId('pause-resume-button').click()
		await expect(page.getByTestId('pause-resume-button')).toHaveText('Pause')
		// `resetWorld` clicks the Reset button inside the robot-debug card, now in
		// the Utils tab of the right panel (Phase 2).
		await activateTab(page, 'utils')
		await resetWorld(page)
	})

	test('no errors during navigation flow', async ({ page }) => {
		const sim: Simulator = await launchSimulatorForWorld(page)
		// Place a goal in world coordinates and let the robot reach it; the
		// console guard must remain silent throughout the autonomous drive.
		await sim.placeGoal({ x: 2, y: -1.5 })
		await sim.waitForGoalReached(30_000)
	})

	test('no errors toggling sensors', async ({ page }) => {
		await launchSimulator(page)
		await page.getByTestId('lidar-toggle').click()
		await page.waitForTimeout(200)
		await page.getByTestId('lidar-toggle').click()
		await page.getByTestId('camera-toggle').click()
		await expect(page.getByTestId('camera-viewport')).toBeVisible()
	})

	test('no errors during occupancy grid toggles', async ({ page }) => {
		await launchSimulator(page)
		// The grid / minimap toggles live in the Map tab of the right panel
		// (Phase 2).
		await activateTab(page, 'map')
		await page.getByTestId('occupancy-grid-toggle').click()
		await page.getByTestId('occupancy-grid-toggle').click()
		await page.getByTestId('minimap-toggle').click()
		await page.getByTestId('minimap-toggle').click()
	})

	test('no unhandled promise rejections on window', async ({ page }) => {
		await launchSimulator(page)
		// The shared console guard already traps page.on('pageerror'), which
		// catches unhandled rejections. A positive test: inject a harmless
		// promise that resolves and assert the suite stays green.
		await page.evaluate(() => Promise.resolve('ok'))
	})

	test('no WebGL context loss on startup', async ({ page }) => {
		await launchSimulator(page)
		// The shared guard already surfaces WebGL context issues via
		// page.on('console') filtering. A clean pass means no context loss.
	})
})
