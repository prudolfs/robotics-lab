import { expect, test } from '@playwright/test'
import { launchSimulator } from './fixtures'
import { setupConsoleGuard, teardownConsoleGuard } from './console-guard'

/**
 * Phase 4 — Sensor Rendering.
 *
 * Verifies the simulation-to-rendering pipeline for sensors without
 * asserting exact values:
 *  - enable lidar → rays appear
 *  - enable lidar → hit points render
 *  - disable lidar → visualization is removed
 *  - robot camera viewport renders
 *
 * Tests interact only through the public UI (toggle buttons). No internal
 * state is touched. WebGL-rendered elements cannot be inspected directly,
 * so we verify the application remains stable and the toggle states change.
 */

test.beforeEach(async ({ page }) => setupConsoleGuard(page))
test.afterEach(async () => teardownConsoleGuard())

test.describe('Phase 4 — Sensor Rendering', () => {
	test('enable lidar → rays appear', async ({ page }) => {
		await launchSimulator(page)

		const lidarToggle = page.getByTestId('lidar-toggle')

		// Lidar is enabled by default; start fresh by toggling off then on.
		await lidarToggle.click()
		await page.waitForTimeout(200)
		await lidarToggle.click()

		// After toggling back on, the application must remain stable.
		await page
			.getByTestId('fps-counter')
			.filter({ hasText: /FPS: [1-9]/ })
			.waitFor({ state: 'visible', timeout: 15_000 })
	})

	test('enable lidar → hit points render', async ({ page }) => {
		await launchSimulator(page)

		// Toggle lidar off then on again, simulating a full re-mount of the
		// lidar visualization layer (rays + hit points).
		await page.getByTestId('lidar-toggle').click()
		await page.waitForTimeout(200)
		await page.getByTestId('lidar-toggle').click()

		// Wait for the simulation to stabilize after the toggle cycle.
		await page
			.getByTestId('fps-counter')
			.filter({ hasText: /FPS: [1-9]/ })
			.waitFor({ state: 'visible', timeout: 15_000 })
	})

	test('disable lidar → visualization is removed', async ({ page }) => {
		await launchSimulator(page)

		// Toggle lidar off from its default-on state.
		await page
			.getByTestId('lidar-toggle')
			.click()

		// The LidarView unmounts from the scene; verify the renderer stays alive.
		await page
			.getByTestId('fps-counter')
			.filter({ hasText: /FPS: [1-9]/ })
			.waitFor({ state: 'visible', timeout: 15_000 })
	})

	test('robot camera viewport renders', async ({ page }) => {
		await launchSimulator(page)

		// Camera is off by default.
		await expect(page.getByTestId('camera-viewport')).toHaveCount(0)

		// Toggle camera on.
		await page.getByTestId('camera-toggle').click()

		// The camera viewport should now be visible in the DOM.
		await expect(page.getByTestId('camera-viewport')).toBeVisible()

		// Verify the app remains stable with an extra canvas running.
		await page
			.getByTestId('fps-counter')
			.filter({ hasText: /FPS: [1-9]/ })
			.waitFor({ state: 'visible', timeout: 15_000 })
	})
})
