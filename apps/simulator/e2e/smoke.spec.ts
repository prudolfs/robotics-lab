import { type ConsoleMessage, expect, test } from '@playwright/test'
import { launchSimulator } from './fixtures'

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

// Accumulated console / pageerror / webgl failures, captured globally.
const failures: string[] = []

test.beforeEach(async ({ page }) => {
	failures.length = 0

	page.on('console', (msg: ConsoleMessage) => {
		if (msg.type() === 'error') {
			failures.push(`console.error: ${msg.text()}`)
		}
	})

	page.on('pageerror', (err: Error) => {
		failures.push(`pageerror: ${err.message}`)
	})

	page.on('requestfailed', (req) => {
		const url = req.url()
		// Ignore favicon noise.
		if (url.endsWith('/favicon.ico')) return
		failures.push(`requestfailed: ${url} — ${req.failure()?.errorText ?? ''}`)
	})

	// Detect WebGL context loss: a 'webglcontextlost' event is dispatched on
	// the <canvas>. We surface it as a failure.
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
