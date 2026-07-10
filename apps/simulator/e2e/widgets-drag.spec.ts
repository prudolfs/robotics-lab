import { expect, type Page, test } from '@playwright/test'
import { setupConsoleGuard, teardownConsoleGuard } from './console-guard'
import { launchSimulator } from './fixtures'

/**
 * Phase 3 — Widget drag-out + edge drop pop-out (see docs/hud.md).
 *
 * Verifies the pop-out interaction with dnd-kit (pointer-based drag):
 *  - dragstart closes the panel and surfaces the viewport edge drop zones
 *  - dropping on an edge moves the widget onto the viewport (panel slot hides)
 *  - the popped copy shows a close button; the panel copy is gone while popped
 *  - clicking close moves the widget back to the panel
 *  - re-dragging the popped copy's handle re-docks it to a new edge
 *  - re-dropping moves (never duplicates) the same kind
 *  - the camera feed widget pops out taking its live viewport with it
 *
 * Drag is driven by Playwright's real `page.mouse` — dnd-kit uses pointer
 * events, so the native path works the same way a real browser gesture does.
 */

test.beforeEach(async ({ page }) => setupConsoleGuard(page))
test.afterEach(async () => teardownConsoleGuard())

/** Viewport-relative drop coordinates for each edge band (inside the edge). */
async function edgePoint(page: Page, edge: 'top' | 'right' | 'bottom' | 'left') {
	const box = await page.getByTestId('simulation-viewport').boundingBox()
	expect(box, 'viewport must have a bounding box').not.toBeNull()
	const inset = 40
	switch (edge) {
		case 'top':
			return { x: box.x + box.width / 2, y: box.y + inset }
		case 'bottom':
			return { x: box.x + box.width / 2, y: box.y + box.height - inset }
		case 'left':
			return { x: box.x + inset, y: box.y + box.height / 2 }
		case 'right':
			return { x: box.x + box.width - inset, y: box.y + box.height / 2 }
	}
}

/** Get the center of a drag handle element by testid. */
async function centerOf(page: Page, selector: string) {
	const el = page.locator(selector).first()
	await expect(el).toBeVisible()
	const box = await el.boundingBox()
	expect(box, `handle ${selector} must have a bounding box`).not.toBeNull()
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/**
 * Drive a dnd-kit drag with the real mouse: move to the handle, press, move
 * past the activation threshold (so the drag actually starts), then keep
 * moving to the target edge point and release. Waits for the drop zones to
 * appear once the drag starts.
 */
async function dragHandleToEdge(
	page: Page,
	handleSelector: string,
	edge: 'top' | 'right' | 'bottom' | 'left',
) {
	const start = await centerOf(page, handleSelector)
	const { x, y } = await edgePoint(page, edge)

	await page.mouse.move(start.x, start.y)
	await page.mouse.down()
	// Nudge past the 8px activation threshold to trigger the dnd-kit drag.
	await page.mouse.move(start.x + 12, start.y + 12, { steps: 4 })
	// Wait for the panel to close + drop zones to mount.
	await expect(page.getByTestId('drop-zones')).toBeVisible({ timeout: 5_000 })
	// Drag to the edge zone and wait for it to highlight as the active drop
	// target before releasing — avoids a release that lands before dnd-kit's
	// droppable hit-test catches up (the main source of e2e flake).
	await page.mouse.move(x, y, { steps: 12 })
	const zone = page.getByTestId(`drop-zone-${edge}`)
	await expect(zone).toHaveAttribute('data-over', 'true', { timeout: 5_000 })
	await page.mouse.up()
}

test.describe('Phase 3 — Widget drag-out + edge drop', () => {
	test('dragstart closes the panel and surfaces the edge drop zones', async ({ page }) => {
		await launchSimulator(page)
		await expect(page.getByTestId('right-panel')).toHaveAttribute('data-open', 'true')
		await expect(page.getByTestId('drop-zones')).toHaveCount(0)

		// Move onto the first handle, press, and nudge past the threshold so the
		// dnd-kit drag starts (panel closes + zones appear). Then cancel via Esc.
		const start = await centerOf(page, '[data-testid="widget-drag-handle"]')
		await page.mouse.move(start.x, start.y)
		await page.mouse.down()
		await page.mouse.move(start.x + 12, start.y + 12, { steps: 4 })
		await expect(page.getByTestId('right-panel')).toHaveAttribute('data-open', 'false')
		await expect(page.getByTestId('drop-zones')).toBeVisible()

		// Cancel the drag (Esc). dnd-kit cancels on Escape.
		await page.keyboard.press('Escape')
		await expect(page.getByTestId('right-panel')).toHaveAttribute('data-open', 'true')
	})

	test('drop on right edge moves the lidar widget onto the viewport', async ({ page }) => {
		await launchSimulator(page)
		await expect(page.getByTestId('popped-widget-sensors.lidar')).toHaveCount(0)

		// Baseline handle count in the panel (only the sensors tab is active by
		// default; hidden panes still mount their cards, so all not-popped kinds
		// carry a handle). With the move model, popping a kind hides its panel card
		// entirely, so the handle count drops by one per popped kind.
		const before = await page.getByTestId('widget-drag-handle').count()

		await dragHandleToEdge(page, '[data-testid="widget-drag-handle"]', 'right')

		const popped = page.getByTestId('popped-widget-sensors.lidar')
		await expect(popped).toBeVisible()
		await expect(popped).toHaveAttribute('data-edge', 'right')

		// The panel copy is now hidden (move, not duplicate) — one fewer handle.
		await expect.poll(async () => page.getByTestId('widget-drag-handle').count()).toBe(before - 1)
		await expect(page.getByTestId('popped-remove-sensors.lidar')).toBeVisible()
	})

	test('close button moves the popped widget back to the panel', async ({ page }) => {
		await launchSimulator(page)
		const baseline = await page.getByTestId('widget-drag-handle').count()
		await dragHandleToEdge(page, '[data-testid="widget-drag-handle"]', 'right')
		const popped = page.getByTestId('popped-widget-sensors.lidar')
		await expect(popped).toBeVisible()
		// The panel card hides while popped — one fewer handle.
		await expect.poll(async () => page.getByTestId('widget-drag-handle').count()).toBe(baseline - 1)

		await page.getByTestId('popped-remove-sensors.lidar').click()
		await expect(popped).toHaveCount(0)
		// Closing moves it back to the panel — the handle returns.
		await expect.poll(async () => page.getByTestId('widget-drag-handle').count()).toBe(baseline)
	})

	test('re-docking the popped copy moves it to a new edge', async ({ page }) => {
		await launchSimulator(page)
		await dragHandleToEdge(page, '[data-testid="widget-drag-handle"]', 'right')
		let popped = page.getByTestId('popped-widget-sensors.lidar')
		await expect(popped).toHaveAttribute('data-edge', 'right')

		await dragHandleToEdge(page, '[data-testid="popped-drag-handle-sensors.lidar"]', 'top')
		popped = page.getByTestId('popped-widget-sensors.lidar')
		await expect(popped).toHaveCount(1)
		await expect(popped).toHaveAttribute('data-edge', 'top')
	})

	test('re-dropping moves — never duplicates — the same kind', async ({ page }) => {
		await launchSimulator(page)
		await dragHandleToEdge(page, '[data-testid="widget-drag-handle"]', 'right')
		await dragHandleToEdge(page, '[data-testid="popped-drag-handle-sensors.lidar"]', 'bottom')
		await expect(page.getByTestId('popped-widget-sensors.lidar')).toHaveCount(1)
		await expect(page.getByTestId('popped-widget-sensors.lidar')).toHaveAttribute(
			'data-edge',
			'bottom',
		)
	})

	test('camera feed widget pops out with its live viewport', async ({ page }) => {
		await launchSimulator(page)
		// Turn the camera on via the Sensors-tab feed widget.
		await page.getByTestId('camera-toggle').click()
		await expect(page.getByTestId('camera-viewport')).toBeVisible()

		// The camera feed card is third in the Sensors tab (after lidar, camera
		// controls), so its handle is the 3rd widget drag handle. Use nth() so
		// the drag helper can locate it.
		const selector = '[data-testid="widget-drag-handle"] >> nth=2'
		await dragHandleToEdge(page, selector, 'right')

		await expect(page.getByTestId('popped-widget-sensors.camera.feed')).toBeVisible()
		await expect(page.getByTestId('camera-viewport')).toBeVisible()

		await page.getByTestId('popped-remove-sensors.camera.feed').click()
		await expect(page.getByTestId('popped-widget-sensors.camera.feed')).toHaveCount(0)
		await expect(page.getByTestId('camera-viewport')).toBeVisible()
	})
})
