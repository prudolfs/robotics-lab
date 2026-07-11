import { expect, test } from '@playwright/test'
import { setupConsoleGuard, teardownConsoleGuard } from './console-guard'
import { launchSimulator } from './fixtures'

/**
 * Phase 4d — Dark theme default + light/dark toggle (see docs/hud.md).
 *
 * Verifies:
 *  - the app loads in dark mode by default (`<html>` has the `dark` class)
 *  - clicking the top-bar theme toggle flips `<html>` between dark / not-dark
 *  - the toggle's `aria-pressed` mirrors the current theme (dark → pressed)
 *  - the choice persists across a reload (localStorage)
 *
 * Each test runs against Playwright's per-test isolated browser context, so
 * `localStorage` starts empty without any explicit clear — we must NOT use
 * `page.addInitScript(… localStorage.removeItem …)` because that would re-run
 * on every navigation (including `page.reload()`) and clobber the persisted
 * choice the reload test sets and then reads back.
 */

test.beforeEach(async ({ page }) => setupConsoleGuard(page))
test.afterEach(async () => teardownConsoleGuard())

const STORAGE_KEY = 'robotics-lab.theme'

test.describe('Phase 4d — Theme toggle', () => {
	// Emulate a dark color scheme so the OS-preference fallback (`matchMedia
	// (prefers-color-scheme: dark)`) reports dark, matching the plan's
	// "default dark" expectation when no stored choice exists (the per-test
	// isolated context has empty localStorage at first nav).
	test.use({ colorScheme: 'dark' })

	test('app loads in dark mode by default', async ({ page }) => {
		await launchSimulator(page)

		// <html> should carry the `dark` class on first load.
		const hasDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
		expect(hasDark).toBe(true)

		// The theme toggle is present and reports we're in dark mode.
		const toggle = page.getByTestId('theme-toggle')
		await expect(toggle).toBeVisible()
		await expect(toggle).toHaveAttribute('aria-pressed', 'true')
	})

	test('clicking the toggle flips <html>.dark and aria-pressed', async ({ page }) => {
		await launchSimulator(page)

		const toggle = page.getByTestId('theme-toggle')
		await expect(toggle).toHaveAttribute('aria-pressed', 'true')

		// Flip to light: dark class disappears, aria-pressed goes false.
		await toggle.click()
		await expect(toggle).toHaveAttribute('aria-pressed', 'false')
		const hasDarkAfter = await page.evaluate(() =>
			document.documentElement.classList.contains('dark'),
		)
		expect(hasDarkAfter).toBe(false)

		// Flip back to dark.
		await toggle.click()
		await expect(toggle).toHaveAttribute('aria-pressed', 'true')
		const hasDarkRestored = await page.evaluate(() =>
			document.documentElement.classList.contains('dark'),
		)
		expect(hasDarkRestored).toBe(true)
	})

	test('the theme choice persists across a reload', async ({ page }) => {
		await launchSimulator(page)

		// Flip to light.
		const toggle = page.getByTestId('theme-toggle')
		await toggle.click()
		await expect(toggle).toHaveAttribute('aria-pressed', 'false')

		// Persisted to localStorage.
		const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
		expect(stored).toBe('light')

		// After reload the choice is restored (light, not the default dark).
		// We deliberately do NOT add an init script here — it would run on
		// the reload and wipe the choice we just persisted.
		await page.reload()
		await page.getByTestId('simulator-canvas').waitFor({ state: 'visible' })
		const hasDarkAfterReload = await page.evaluate(() =>
			document.documentElement.classList.contains('dark'),
		)
		expect(hasDarkAfterReload).toBe(false)
		const restoredPressed = await page.getByTestId('theme-toggle').getAttribute('aria-pressed')
		expect(restoredPressed).toBe('false')
	})
})
