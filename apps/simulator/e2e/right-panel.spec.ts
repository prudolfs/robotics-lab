import { expect, test } from '@playwright/test'
import { setupConsoleGuard, teardownConsoleGuard } from './console-guard'
import { launchSimulator } from './fixtures'

/**
 * Phase 1 + Phase 4 — Right panel shell (see docs/hud.md).
 *
 * Verifies the tabbed right panel:
 *  - visible by default with all 5 tabs
 *  - collapse toggle slides the panel body fully off the right viewport edge
 *    (`translate-x-full`); the toggle stays in place as a sibling so it's
 *    reachable in both states (Phase 4a)
 *  - re-opening restores it onto the screen
 *  - selecting each tab shows that tab's pane and updates `aria-selected`
 *  - the 5th tab (utils) is off the strip by default and scrolled into view
 *    when selected (4 visible + 1 horizontally scrolled)
 *  - keyboard arrow / Home / End nav moves between tabs and wraps (Phase 4e)
 */

test.beforeEach(async ({ page }) => setupConsoleGuard(page))
test.afterEach(async () => teardownConsoleGuard())

const TAB_IDS = ['sensors', 'map', 'nav', 'teleop', 'utils', 'editor', 'playback', 'inspect'] as const

test.describe('Phase 1 + 4 — Right panel shell', () => {
	test('panel is visible by default with all eight tabs', async ({ page }) => {
		await launchSimulator(page)

		const panel = page.getByTestId('right-panel')
		await expect(panel).toBeVisible()
		await expect(panel).toHaveAttribute('data-open', 'true')

		for (const id of TAB_IDS) {
			await expect(page.getByTestId(`panel-tab-${id}`)).toBeVisible()
		}
	})

	test('collapse toggle slides the panel fully off the right viewport edge', async ({ page }) => {
		await launchSimulator(page)

		const panel = page.getByTestId('right-panel')
		const toggle = page.getByTestId('panel-toggle')
		const vw = () => page.viewportSize().width

		// Open: the panel is on-screen (its right edge is within the viewport).
		await expect(panel).toBeVisible()
		await expect(panel).toHaveAttribute('data-open', 'true')
		const openBox = await panel.boundingBox()
		expect(openBox, 'open panel must have a bounding box').not.toBeNull()
		expect(openBox.x + openBox.width).toBeLessThanOrEqual(vw() + 1)

		// Collapse: the panel slides `translate-x-full` so its left edge moves
		// past the viewport's right edge (fully off-screen). Phase 4a.
		await expect(toggle).toBeVisible()
		await toggle.click()
		await expect(panel).toHaveAttribute('data-open', 'false')
		// Give the 300ms transition time to settle before reading geometry.
		await page.waitForTimeout(450)
		const closedBox = await panel.boundingBox()
		expect(closedBox, 'closed panel must have a bounding box').not.toBeNull()
		expect(closedBox.x + closedBox.width).toBeGreaterThan(vw())

		// The toggle stays reachable — it's a sibling fixed along the right edge.
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
			await expect(page.getByTestId(`panel-tab-${id}`)).toHaveAttribute('aria-selected', 'true')
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
		expect(utilsBox?.x).toBeGreaterThan(stripBox?.x + stripBox?.width - 1)

		// Selecting utils scrolls it to the center of the strip.
		await utilsTab.click()
		await expect(page.getByTestId('panel-tab-utils')).toHaveAttribute('aria-selected', 'true')

		// After the smooth scroll, the tab is within the visible strip bounds.
		const visibleBox = await utilsTab.boundingBox()
		expect(visibleBox?.x).toBeGreaterThanOrEqual(stripBox?.x - 1)
		expect(visibleBox?.x + visibleBox?.width).toBeLessThanOrEqual(stripBox?.x + stripBox?.width + 1)
	})

	test('keyboard arrow / Home / End nav moves between tabs and wraps', async ({ page }) => {
		await launchSimulator(page)

		// Focus the active Sensors tab so keyboard nav targets the tablist.
		const sensors = page.getByTestId('panel-tab-sensors')
		await sensors.focus()
		await expect(sensors).toHaveAttribute('aria-selected', 'true')

		// ArrowRight cycles through all intermediate tabs and wraps back to sensors.
		for (const expected of ['map', 'nav', 'teleop', 'utils', 'editor', 'playback', 'inspect', 'sensors']) {
			await page.keyboard.press('ArrowRight')
			await expect(page.getByTestId(`panel-tab-${expected}`)).toHaveAttribute(
				'aria-selected',
				'true',
			)
		}

		// ArrowLeft wraps the other way: sensors → inspect (the new last tab).
		await page.keyboard.press('ArrowLeft')
		await expect(page.getByTestId('panel-tab-inspect')).toHaveAttribute('aria-selected', 'true')

		// Home jumps to the first tab; End jumps to the last (inspect now).
		await page.keyboard.press('Home')
		await expect(page.getByTestId('panel-tab-sensors')).toHaveAttribute('aria-selected', 'true')
		await page.keyboard.press('End')
		await expect(page.getByTestId('panel-tab-inspect')).toHaveAttribute('aria-selected', 'true')
	})
})
