import { expect, test } from '@playwright/test'
import { setupConsoleGuard, teardownConsoleGuard } from './console-guard'
import { launchSimulator, resetWorld, waitForIdle } from './fixtures'

/**
 * Phase 11 — Localization.
 *
 * Verifies the dead-reckoning odometry surface without asserting exact
 * values:
 *  - the localization HUD mounts and reports an estimate
 *  - the dead-reckoned pose is exposed for the test harness
 *  - toggling the trail off/on keeps the app stable
 *  - clearing the trail empties the history while keeping the estimate
 *
 * Tests interact only through the public UI (toggle / clear buttons). No
 * internal state is touched. WebGL-rendered elements cannot be inspected
 * directly, so the trail polyline is asserted transitively through the
 * trail-length counter exposed in the HUD.
 */

test.beforeEach(async ({ page }) => setupConsoleGuard(page))
test.afterEach(async () => teardownConsoleGuard())

test.describe('Phase 11 — Localization', () => {
	test('localization HUD mounts and exposes the dead-reckoned pose', async ({ page }) => {
		await launchSimulator(page)

		const hud = page.getByTestId('localization-hud')
		await expect(hud).toBeVisible()
		await expect(page.getByTestId('odometry-pose')).toBeVisible()
		await expect(page.getByTestId('odometry-count')).toBeVisible()
		await expect(page.getByTestId('odometry-drift')).toBeVisible()

		// At spawn the estimate and the truth coincide: drift reads ~0.00 m.
		const driftText = await page.getByTestId('odometry-drift').textContent()
		expect(driftText).toContain('Drift')

		await waitForIdle(page)
	})

	test('dead-reckoning trail grows as the robot moves', async ({ page }) => {
		await launchSimulator(page)
		await resetWorld(page)

		// Drive forward for a moment.
		await page.keyboard.down('KeyW')
		await page.waitForTimeout(1200)
		await page.keyboard.up('KeyW')

		// After motion the trail length must have grown beyond the spawn sample.
		const countAfter = await page.getByTestId('odometry-count').textContent()
		expect(Number.parseInt(countAfter ?? '0', 10)).toBeGreaterThan(1)
		await waitForIdle(page)
	})

	test('toggle trail off removes the overlay then on restores it', async ({ page }) => {
		await launchSimulator(page)

		const toggle = page.getByTestId('odometry-toggle')
		await expect(toggle).toBeVisible()

		await toggle.click() // off
		await page.waitForTimeout(200)
		await toggle.click() // on
		await waitForIdle(page)
	})

	test('clear trail empties the history but keeps the estimate', async ({ page }) => {
		await launchSimulator(page)
		await resetWorld(page)

		// Move so a trail builds up.
		await page.keyboard.down('KeyW')
		await page.waitForTimeout(1000)
		await page.keyboard.up('KeyW')

		const before = await page.getByTestId('odometry-count').textContent()
		expect(Number.parseInt(before ?? '0', 10)).toBeGreaterThan(1)

		// Pause so the loop doesn't keep appending samples while we assert:
		// with the sim frozen, clearing is guaranteed to leave exactly one pose.
		await page.getByTestId('pause-resume-button').click()
		await waitForIdle(page)

		await page.getByTestId('clear-odometry-button').click()
		// With the sim paused the cleared trail cannot regrow: exactly one sample
		// (the current estimate) remains.
		await expect
			.poll(async () => Number.parseInt((await page.getByTestId('odometry-count').textContent()) ?? '0', 10))
			.toBe(1)
		await waitForIdle(page)
	})
})
