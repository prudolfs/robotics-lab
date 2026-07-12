import { expect, test } from '@playwright/test'
import { setupConsoleGuard, teardownConsoleGuard } from './console-guard'
import { activateTab, launchSimulator } from './fixtures'

/**
 * Phase 5 — Utils tab System Logs widget.
 *
 * The logs widget captures `console.info/warn/error` into a ring buffer and
 * renders them in a scrollable mono box in the Utils tab. The shared console
 * guard flags `console.error` — so this spec __only__ injects `info` / `warn`
 * (which the guard ignores) to drive the capture→render→clear path; the
 * `error` level is covered by `logger.test.ts`.
 */

test.beforeEach(async ({ page }) => setupConsoleGuard(page))
test.afterEach(async () => teardownConsoleGuard())

test.describe('Phase 5 — System Logs widget', () => {
	test('shows the "No logs yet" placeholder when the buffer is empty', async ({ page }) => {
		await launchSimulator(page)
		await activateTab(page, 'utils')
		await expect(page.getByTestId('logs-view')).toBeVisible()
		// The simulator emits a THREE.Clock deprecation `console.warn` at startup, so
		// the buffer is not empty by launch time. Clear it and assert the
		// placeholder reappears — proving Clear empties it and the empty state
		// renders the placeholder.
		const clear = page.getByTestId('logs-clear')
		await clear.waitFor({ state: 'visible' })
		if (await clear.isEnabled()) await clear.click()
		await expect(page.getByTestId('logs-view')).toContainText('No logs yet')
		await expect(page.getByTestId('logs-clear')).toBeDisabled()
	})

	test('captured console.info lines appear in the logs view', async ({ page }) => {
		await launchSimulator(page)
		await activateTab(page, 'utils')
		await page.getByTestId('logs-clear').click()
		await page.evaluate(() => console.info('phase5 hello'))
		// The capture is synchronous in-page; the React subscription updates on
		// the next tick. Wait for the line to render.
		await expect(page.getByTestId('logs-view')).toContainText('phase5 hello', { timeout: 5_000 })
		await expect(page.getByTestId('logs-clear')).toBeEnabled()
		await expect(page.getByTestId('logs-view')).toContainText(/INFO/)
	})

	test('captured console.warn lines appear with the WARN tag', async ({ page }) => {
		await launchSimulator(page)
		await activateTab(page, 'utils')
		await page.getByTestId('logs-clear').click()
		await page.evaluate(() => console.warn('phase5 careful'))
		await expect(page.getByTestId('logs-view')).toContainText('phase5 careful', { timeout: 5_000 })
		await expect(page.getByTestId('logs-view')).toContainText(/WARN/)
	})

	test('multiple lines accumulate in order', async ({ page }) => {
		await launchSimulator(page)
		await activateTab(page, 'utils')
		await page.getByTestId('logs-clear').click()
		await page.evaluate(() => {
			console.info('first')
			console.warn('second')
		})
		const view = page.getByTestId('logs-view')
		await expect(view).toContainText('first', { timeout: 5_000 })
		await expect(view).toContainText('second')
		// Order: "first" should appear before "second" in the DOM.
		const text = await view.textContent()
		expect(text?.indexOf('first')).toBeLessThan(text?.indexOf('second') ?? -1)
	})

	test('Clear empties the buffer and shows the placeholder again', async ({ page }) => {
		await launchSimulator(page)
		await activateTab(page, 'utils')
		await page.getByTestId('logs-clear').click()
		await page.evaluate(() => console.info('phase5 goodbye'))
		await expect(page.getByTestId('logs-view')).toContainText('phase5 goodbye', {
			timeout: 5_000,
		})
		await page.getByTestId('logs-clear').click()
		await expect(page.getByTestId('logs-view')).toContainText('No logs yet')
		await expect(page.getByTestId('logs-clear')).toBeDisabled()
	})
})
