import { expect, test } from '@playwright/test'
import { setupConsoleGuard, teardownConsoleGuard } from './console-guard'
import { getSimTime, launchSimulator, resetWorld } from './fixtures'

/**
 * Phase 1 — Simulation Lifecycle.
 *
 * Verifies the simulation loop and playback controls work in the browser:
 *  - the simulation clock advances when running
 *  - pause stops the clock
 *  - resume restarts the clock
 *  - reset returns the robot to its initial pose
 *  - reset syncs the renderer to the new state
 *
 * Console guards mirror the Phase 0 smoke suite so any scenario here also
 * enforces a clean console.
 */

test.beforeEach(async ({ page }) => setupConsoleGuard(page))
test.afterEach(async () => teardownConsoleGuard())

test.describe('Phase 1 — Simulation lifecycle', () => {
	test('simulation clock advances when running', async ({ page }) => {
		await launchSimulator(page)

		// Wait until the loop has produced a non-zero clock, then sample twice.
		await expect
			.poll(async () => Number(await getSimTime(page)), { timeout: 15_000 })
			.toBeGreaterThan(0)

		const before = await getSimTime(page)
		// Give the fixed-step integrator a moment to advance.
		await page.waitForTimeout(500)
		const after = await getSimTime(page)

		expect(after).toBeGreaterThan(before)
	})

	test('pause stops the simulation clock', async ({ page }) => {
		await launchSimulator(page)

		// Wait until the clock is running so pause is meaningful.
		await expect
			.poll(async () => Number(await getSimTime(page)), { timeout: 15_000 })
			.toBeGreaterThan(0)

		await page.getByTestId('pause-resume-button').click()
		// The button flips to "Resume" once paused.
		await expect(page.getByTestId('pause-resume-button')).toHaveText('Resume')

		// Two samples while paused must be identical (no integration step).
		const pausedA = await getSimTime(page)
		await page.waitForTimeout(500)
		const pausedB = await getSimTime(page)
		expect(pausedB).toBe(pausedA)
	})

	test('resume restarts the simulation clock', async ({ page }) => {
		await launchSimulator(page)

		await expect
			.poll(async () => Number(await getSimTime(page)), { timeout: 15_000 })
			.toBeGreaterThan(0)

		await page.getByTestId('pause-resume-button').click()
		await expect(page.getByTestId('pause-resume-button')).toHaveText('Resume')
		const paused = await getSimTime(page)

		await page.getByTestId('pause-resume-button').click()
		await expect(page.getByTestId('pause-resume-button')).toHaveText('Pause')

		// After resume the clock must advance past the paused snapshot.
		await expect
			.poll(async () => Number(await getSimTime(page)), { timeout: 10_000 })
			.toBeGreaterThan(paused)
	})

	test('reset returns the robot to its initial pose', async ({ page }) => {
		await launchSimulator(page)

		// Let the sim run so the clock is non-zero before reset.
		await expect
			.poll(async () => Number(await getSimTime(page)), { timeout: 15_000 })
			.toBeGreaterThan(0)

		await resetWorld(page)

		// The spawn pose is the origin; the debug overlay reads it back.
		const debug = page.getByTestId('robot-debug')
		await expect(debug).toContainText(/Position\s*x 0\.00\s*y 0\.00/)
		await expect(debug).toContainText(/Heading\s*0\.0°/)
	})

	test('reset syncs the renderer to the new state', async ({ page }) => {
		await launchSimulator(page)

		await expect
			.poll(async () => Number(await getSimTime(page)), { timeout: 15_000 })
			.toBeGreaterThan(0)

		// Pause so the loop stops advancing the clock, then reset. While paused
		// the reset zeroes the sim clock deterministically and the renderer mirrors
		// it; we then assert the clock stays at ~0 rather than re-advancing.
		await page.getByTestId('pause-resume-button').click()
		await expect(page.getByTestId('pause-resume-button')).toHaveText('Resume')

		await resetWorld(page)

		expect(await getSimTime(page)).toBeLessThan(0.5)
		// Two paused samples must stay equal at ~0 — the renderer reflects reset
		// and the clock doesn't creep.
		const a = await getSimTime(page)
		await page.waitForTimeout(500)
		const b = await getSimTime(page)
		expect(b).toBe(a)
	})
})
