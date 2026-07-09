import { expect, test } from '@playwright/test'
import { setupConsoleGuard, teardownConsoleGuard } from './console-guard'
import { launchSimulator } from './fixtures'

/**
 * Phase 1 — Right panel shell (see docs/hud.md).
 *
 * Verifies the new tabbed right panel:
 *  - visible by default with the 5 tabs present
 *  - collapse toggle hides the panel body, re-open shows it again
 *  - selecting each tab shows that tab's pane
 *  - the 5th tab (utils) is off the strip by default and scrolled into view
 *    when selected (4 visible + 1 horizontally scrolled)
 *
 * Tests interact only through the public UI; no internal state touched.
 */

test.beforeEach(async ({ page }) => setupConsoleGuard(page))
test.afterEach(async () => teardownConsoleGuard())

const TAB_IDS = ['sensors', 'map', 'nav', 'teleop', 'utils'] as const

test.describe('Phase 1 — Right panel shell', () => {
	test('panel is visible by default with all five tabs', async ({ page }) => {
		await launchSimulator(page)

		const panel = page.getByTestId('right-panel')
		await expect(panel).toBeVisible()
		await expect(panel).toHaveAttribute('data-open', 'true')

		for (const id of TAB_IDS) {
			await expect(page.getByTestId(`panel-tab-${id}`)).toBeVisible()
		}
	})

	test('collapse toggle hides then re-shows the panel', async ({ page }) => {
		await launchSimulator(page)

		const panel = page.getByTestId('right-panel')
		const toggle = page.getByTestId('panel-toggle')

		// Collapse: the toggle should remain reachable (it pokes out) while the
		// panel body slides off-screen.
		await expect(toggle).toBeVisible()
		await toggle.click()

		await expect(panel).toHaveAttribute('data-open', 'false')

		// Re-open via the same toggle.
		await expect(toggle).toBeVisible()
		await toggle.click()
		await expect(panel).toHaveAttribute('data-open', 'true')
	})

	test('selecting each tab reveals its pane and the others are hidden', async ({ page }) => {
		await launchSimulator(page)

		for (const id of TAB_IDS) {
			await page.getByTestId(`panel-tab-${id}`).click()
			// The selected tab's pane is visible; only one pane is visible at a time.
			const visibleCount = await page
				.locator('[data-testid^="panel-content-"][role="tabpanel"]')
				.and(page.locator(':visible'))
				.count()
			expect(visibleCount).toBe(1)
			await expect(page.getByTestId(`panel-tab-${id}`)).toHaveAttribute(
				'aria-selected',
				'true',
			)
		}
	})

	test('the fifth tab (utils) starts scrolled off and scrolls into view when selected', async ({
		page,
	}) => {
		await launchSimulator(page)

		// The strip shows 4 tabs (each w-1/4) so the 5th is off to the right.
		const strip = page.locator('[data-testid="right-panel"] [role="tablist"]')
		const stripBox = await strip.boundingBox()
		const utilsTab = page.getByTestId('panel-tab-utils')
		const utilsBox = await utilsTab.boundingBox()

		expect(stripBox, 'strip must have a bounding box').not.toBeNull()
		expect(utilsBox, 'utils tab must have a bounding box').not.toBeNull()
		// By default the utils tab's left edge is to the right of the strip's
		// visible right edge (i.e. scrolled off).
		expect(utilsBox!.x).toBeGreaterThan(stripBox!.x + stripBox!.width - 1)

		// Selecting utils scrolls it to the center of the strip.
		await utilsTab.click()
		await expect(page.getByTestId('panel-tab-utils')).toHaveAttribute('aria-selected', 'true')

		// After the smooth scroll, the tab is within the visible strip bounds.
		const visibleBox = await utilsTab.boundingBox()
		expect(visibleBox!.x).toBeGreaterThanOrEqual(stripBox!.x - 1)
		expect(visibleBox!.x + visibleBox!.width).toBeLessThanOrEqual(
			stripBox!.x + stripBox!.width + 1,
		)
	})
})
