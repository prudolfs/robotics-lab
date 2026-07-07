import { expect, test } from '@playwright/test'
import { launchSimulator } from './fixtures'
import { setupConsoleGuard, teardownConsoleGuard } from './console-guard'

/**
 * Phase 0 — E2E Foundation: smoke test.
 *
 * Verifies the application boots in a real browser:
 *  - canvas becomes visible
 *  - HUD renders
 *  - FPS counter appears
 *  - robot exists
 *
 * Also enforces a clean console (no errors, no unhandled rejections, no
 * WebGL context loss) for every test in the suite via `beforeEach`.
 */

test.beforeEach(async ({ page }) => setupConsoleGuard(page))
test.afterEach(async () => teardownConsoleGuard())

test.describe('Phase 0 — Application starts', () => {
	test('canvas becomes visible', async ({ page }) => {
		await launchSimulator(page)
		await expect(page.getByTestId('simulator-canvas')).toBeVisible()
	})

	test('HUD renders', async ({ page }) => {
		await launchSimulator(page)
		await expect(page.getByTestId('simulator-hud')).toBeVisible()
		await expect(page.getByTestId('simulator-hud')).toContainText(/Robotics Lab — Simulator/)
	})

	test('FPS counter appears', async ({ page }) => {
		await launchSimulator(page)
		// Give the FPS sampler time to report its first value.
		await expect(page.getByTestId('fps-counter').filter({ hasText: /FPS: \d+/ })).toBeVisible({
			timeout: 15_000,
		})
	})

	test('robot exists', async ({ page }) => {
		await launchSimulator(page)
		await expect(page.getByTestId('robot-marker')).toBeAttached()
		await expect(page.getByTestId('robot-debug')).toBeVisible()
	})
})
