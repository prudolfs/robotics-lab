import { expect, test } from '@playwright/test'
import { setupConsoleGuard, teardownConsoleGuard } from './console-guard'
import { launchSimulator, placeGoal, resetWorld } from './fixtures'

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
		await resetWorld(page)
	})

	test('no errors during navigation flow', async ({ page }) => {
		await launchSimulator(page)
		await placeGoal(page, 0.6, 0.55)
		await expect
			.poll(
				async () => {
					const el = page.getByTestId('goal-count')
					const text = (await el.textContent()) ?? '0'
					return Number.parseInt(text, 10)
				},
				{ timeout: 30_000, intervals: [250] },
			)
			.toBe(0)
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
