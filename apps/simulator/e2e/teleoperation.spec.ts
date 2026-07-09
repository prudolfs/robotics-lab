import { expect, test } from '@playwright/test'
import { setupConsoleGuard, teardownConsoleGuard } from './console-guard'
import { activateTab, getRobotPose, launchSimulator } from './fixtures'

/**
 * Phase 2 — Teleoperation.
 *
 * Verifies keyboard input drives the simulated robot through the full stack:
 *  - hold forward key → robot moves
 *  - release forward key → robot stops
 *  - hold reverse key → robot moves backward
 *  - press rotate left → robot rotates left
 *  - press rotate right → robot rotates right
 *  - emergency stop halts the robot
 *
 * Tests interact only through the public UI: real keyboard events and the
 * ESTOP button. No internal state is touched. We assert on observable robot
 * pose instead of timing, in keeping with "stable over exhaustive".
 */

test.beforeEach(async ({ page }) => setupConsoleGuard(page))
test.afterEach(async () => teardownConsoleGuard())

test.describe('Phase 2 — Teleoperation', () => {
	test('hold forward key → robot moves', async ({ page }) => {
		await launchSimulator(page)
		const start = await getRobotPose(page)

		// Hold W and give the fixed-step integrator time to advance the pose.
		await page.keyboard.down('w')
		await expect
			.poll(async () => (await getRobotPose(page)).x, { timeout: 15_000, intervals: [100] })
			.toBeGreaterThan(start.x + 0.05)
	})

	test('release forward key → robot stops', async ({ page }) => {
		await launchSimulator(page)
		const start = await getRobotPose(page)

		// Build up motion by holding forward, then release and confirm the pose
		// stops changing (no runaway drift after release).
		await page.keyboard.down('w')
		await expect
			.poll(async () => (await getRobotPose(page)).x, { timeout: 15_000, intervals: [100] })
			.toBeGreaterThan(start.x + 0.2)
		await page.keyboard.up('w')

		const stopped = await getRobotPose(page)
		await page.waitForTimeout(800)
		const after = await getRobotPose(page)
		expect(Math.abs(after.x - stopped.x)).toBeLessThan(0.05)
	})

	test('hold reverse key → robot moves backward', async ({ page }) => {
		await launchSimulator(page)
		const start = await getRobotPose(page)

		await page.keyboard.down('s')
		await expect
			.poll(async () => (await getRobotPose(page)).x, { timeout: 15_000, intervals: [100] })
			.toBeLessThan(start.x - 0.05)
		await page.keyboard.up('s')
	})

	test('press rotate left → robot rotates left', async ({ page }) => {
		await launchSimulator(page)
		const start = await getRobotPose(page)

		// 'A' turns left (counter-clockwise on screen). The renderer mirrors
		// heading (yaw = -heading), so CCW on screen means pose.heading decreases.
		await page.keyboard.down('a')
		await expect
			.poll(async () => (await getRobotPose(page)).heading, {
				timeout: 15_000,
				intervals: [100],
			})
			.toBeLessThan(start.heading - 0.05)
		await page.keyboard.up('a')
	})

	test('press rotate right → robot rotates right', async ({ page }) => {
		await launchSimulator(page)
		const start = await getRobotPose(page)

		// 'D' turns right (clockwise on screen). The renderer mirrors heading
		// (yaw = -heading), so CW on screen means pose.heading increases.
		await page.keyboard.down('d')
		await expect
			.poll(async () => (await getRobotPose(page)).heading, {
				timeout: 15_000,
				intervals: [100],
			})
			.toBeGreaterThan(start.heading + 0.05)
		await page.keyboard.up('d')
	})

	test('emergency stop halts the robot', async ({ page }) => {
		await launchSimulator(page)
		const start = await getRobotPose(page)

		// Drive forward to build motion, then press the ESTOP button (a user
		// can hit either Space or the button; we exercise the button here).
		await page.keyboard.down('w')
		await expect
			.poll(async () => (await getRobotPose(page)).x, { timeout: 15_000, intervals: [100] })
			.toBeGreaterThan(start.x + 0.2)

		// ESTOP now lives in the Teleop tab of the right panel (Phase 2).
		await activateTab(page, 'teleop')
		await page.getByTestId('estop-button').click()
		// Space held down keeps the keyboard stop intent; the click zeroes the
		// wheels immediately. Capture the pose shortly after the stop and assert
		// it no longer advances.
		const stopped = await getRobotPose(page)
		await page.waitForTimeout(800)
		const after = await getRobotPose(page)
		expect(Math.abs(after.x - stopped.x)).toBeLessThan(0.05)

		// Release the key so lingering blurred between tests cannot leak state.
		await page.keyboard.up('w')
	})
})
