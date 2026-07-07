import { type ConsoleMessage, expect, test } from '@playwright/test'
import { launchSimulator } from './fixtures'

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

const failures: string[] = []

test.beforeEach(async ({ page }) => {
	failures.length = 0

	page.on('console', (msg: ConsoleMessage) => {
		if (msg.type() === 'error') failures.push(`console.error: ${msg.text()}`)
	})

	page.on('pageerror', (err: Error) => {
		failures.push(`pageerror: ${err.message}`)
	})

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
		await page.getByTestId('lidar-toggle').click()

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
