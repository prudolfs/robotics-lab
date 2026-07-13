import { expect, type Page, test } from '@playwright/test'
import { setupConsoleGuard, teardownConsoleGuard } from './console-guard'
import { activateTab, launchSimulator } from './fixtures'

/**
 * Phase 4c — Non-overlapping edge docks (see docs/hud.md).
 *
 * Verifies that multiple dropped widgets on the same edge never overlap
 * (they stack vertically in a flex strip) and that the strip becomes
 * scrollable when the stacked cards overflow the edge span.
 *
 * Drag is driven by Playwright's real `page.mouse` (dnd-kit pointer events).
 */

test.beforeEach(async ({ page }) => setupConsoleGuard(page))
test.afterEach(async () => teardownConsoleGuard())

async function edgePoint(page: Page, edge: 'top' | 'right' | 'bottom' | 'left') {
	const box = await page.getByTestId('simulation-viewport').boundingBox()
	expect(box).not.toBeNull()
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

async function centerOf(page: Page, selector: string) {
	const el = page.locator(selector).first()
	await expect(el).toBeVisible()
	const box = await el.boundingBox()
	expect(box).not.toBeNull()
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** The first **visible** drag handle in the active panel pane. Inactive tab
 *  panes are kept mounted but carry `hidden`, so a plain `.first()` could
 *  land on a hidden Sensors-tab handle after we switched to Map. */
async function activeFirstDragHandleCenter(page: Page) {
	const visible = page.getByTestId('widget-drag-handle').filter({ visible: true }).first()
	await expect(visible).toBeVisible()
	const box = await visible.boundingBox()
	expect(box).not.toBeNull()
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function dragActiveFirstHandleToEdge(page: Page, edge: 'top' | 'right' | 'bottom' | 'left') {
	// The first visible widget drag handle in the active tab pane.
	const start = await activeFirstDragHandleCenter(page)
	const { x, y } = await edgePoint(page, edge)

	await page.mouse.move(start.x, start.y)
	await page.mouse.down()
	await page.mouse.move(start.x + 12, start.y + 12, { steps: 4 })
	await expect(page.getByTestId('drop-zones')).toBeVisible({ timeout: 5_000 })
	await page.mouse.move(x, y, { steps: 12 })
	await expect(page.getByTestId(`drop-zone-${edge}`)).toHaveAttribute('data-over', 'true', {
		timeout: 5_000,
	})
	await page.mouse.up()
}

/** Drive the dnd-kit drag of a popped re-dock handle (`redock` mode) to an
 *  edge. The handle is addressed by the popped container's testid. */
async function dragPoppedHandleToEdge(
	page: Page,
	widget: string,
	edge: 'top' | 'right' | 'bottom' | 'left',
) {
	const start = await centerOf(page, `[data-testid="popped-drag-handle-${widget}"]`)
	const { x, y } = await edgePoint(page, edge)

	await page.mouse.move(start.x, start.y)
	await page.mouse.down()
	await page.mouse.move(start.x + 12, start.y + 12, { steps: 4 })
	await expect(page.getByTestId('drop-zones')).toBeVisible({ timeout: 5_000 })
	await page.mouse.move(x, y, { steps: 12 })
	await expect(page.getByTestId(`drop-zone-${edge}`)).toHaveAttribute('data-over', 'true', {
		timeout: 5_000,
	})
	await page.mouse.up()
}

/** Bounding boxes of the popped cards dropped on a given edge. The rect is
 *  **unclipped** — Playwright's `boundingBox()` reports the layout rect of the
 *  element, not the part visible after its parent's `overflow-y-auto` clips it.
 *  Use this for assertions about a single edge (within-strip stacking order or
 *  count) where you want the child's natural rect even if it overflows the
 *  strip. */
async function poppedBoxes(page: Page, edge: 'top' | 'bottom' | 'left' | 'right') {
	const cards = page.locator(`[data-testid^="popped-widget-"][data-edge="${edge}"]`)
	const count = await cards.count()
	const boxes: { x: number; y: number; w: number; h: number }[] = []
	for (let i = 0; i < count; i++) {
		const box = await cards.nth(i).boundingBox()
		if (box) boxes.push({ x: box.x, y: box.y, w: box.width, h: box.height })
	}
	return boxes
}

/** Bounding boxes of the popped cards on a given edge, **clipped to the
 *  visible rect of their parent strip**. Use this when checking that cards on
 *  *different* edges never intersect — an overflowing child whose body extends
 *  past its strip's `overflow-y-auto` viewport is physically clipped to the
 *  strip's on-screen frame, so two cards in adjacent strips only collide if
 *  their clipped rects overlap. The unclipped `boundingBox()` would otherwise
 *  falsely report an intersection between a long `top` card and a `left`
 *  card two strips below it. */
async function poppedBoxesClipped(page: Page, edge: 'top' | 'bottom' | 'left' | 'right') {
	const cards = page.locator(`[data-testid^="popped-widget-"][data-edge="${edge}"]`)
	const count = await cards.count()
	const boxes: { x: number; y: number; w: number; h: number }[] = []
	for (let i = 0; i < count; i++) {
		const card = cards.nth(i)
		const rect = await card.evaluate((el: HTMLElement) => {
			const strip = el.parentElement
			if (!strip) return null
			const cr = el.getBoundingClientRect()
			const sr = strip.getBoundingClientRect()
			const x = Math.max(cr.x, sr.x)
			const y = Math.max(cr.y, sr.y)
			const right = Math.min(cr.right, sr.right)
			const bottom = Math.min(cr.bottom, sr.bottom)
			return { x, y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) }
		})
		if (rect && rect.w > 0 && rect.h > 0) boxes.push({ x: rect.x, y: rect.y, w: rect.w, h: rect.h })
	}
	return boxes
}

function assertDisjoint(
	a: { x: number; y: number; w: number; h: number },
	b: { x: number; y: number; w: number; h: number },
) {
	const overlapX = a.x < b.x + b.w && b.x < a.x + a.w
	const overlapY = a.y < b.y + b.h && b.y < a.y + a.h
	expect(overlapX && overlapY, 'two cards on the same edge must not overlap').toBe(false)
}

test.describe('Phase 4c — Non-overlapping edge docks', () => {
	test('two widgets dropped on top are laid out horizontally (no overlap)', async ({ page }) => {
		await launchSimulator(page)

		// Drop the first Sensors-tab widget (lidar) on `top`.
		await dragActiveFirstHandleToEdge(page, 'top')
		await expect(page.getByTestId('popped-widget-sensors.lidar')).toBeVisible()

		// Drop the second Sensors-tab widget (camera controls) on `top`.
		await dragActiveFirstHandleToEdge(page, 'top')
		await expect(page.getByTestId('popped-widget-sensors.camera.controls')).toBeVisible()

		// Phase 4 look-and-feel pass: `top`/`bottom` strips are `flex-row`, so
		// the two dropped widgets sit side-by-side (the second is to the right
		// of the first, never on the same pixels).
		const boxes = await poppedBoxes(page, 'top')
		expect(boxes.length).toBe(2)
		assertDisjoint(boxes[0], boxes[1])
		expect(boxes[1].x, 'second top widget is to the right of the first').toBeGreaterThanOrEqual(
			boxes[0].x + boxes[0].w,
		)
	})

	test('a widget on top and one on left never intersect', async ({ page }) => {
		await launchSimulator(page)

		await dragActiveFirstHandleToEdge(page, 'top')
		await expect(page.getByTestId('popped-widget-sensors.lidar')).toBeVisible()

		// Switch tabs so the next dropped widget comes from a different kind.
		await activateTab(page, 'map')
		await dragActiveFirstHandleToEdge(page, 'left')
		await expect(page.getByTestId('popped-widget-map.controls')).toBeVisible()

		const topBoxes = await poppedBoxesClipped(page, 'top')
		const leftBoxes = await poppedBoxesClipped(page, 'left')
		expect(topBoxes.length).toBe(1)
		expect(leftBoxes.length).toBe(1)
		assertDisjoint(topBoxes[0], leftBoxes[0])
	})

	test('dropping enough widgets on `top` makes the horizontal strip scrollable', async ({
		page,
	}) => {
		await launchSimulator(page)

		// Drop all three Sensors-tab widgets on `top` (lidar, camera controls,
		// camera feed), then switch to Map and drop both Map-tab widgets on
		// `top` too — five cards side-by-side overflow the top strip's usable
		// width and force horizontal scroll (`scrollWidth > clientWidth`).
		const dropOnTop = async () => {
			await dragActiveFirstHandleToEdge(page, 'top')
		}
		await dropOnTop() // sensors.lidar
		await dropOnTop() // sensors.camera.controls
		await dropOnTop() // sensors.camera.feed
		await expect(page.getByTestId('popped-widget-sensors.lidar')).toBeVisible()
		await expect(page.getByTestId('popped-widget-sensors.camera.controls')).toBeVisible()
		await expect(page.getByTestId('popped-widget-sensors.camera.feed')).toBeVisible()

		await activateTab(page, 'map')
		await dropOnTop() // map.controls
		await dropOnTop() // map.minimap
		await expect(page.getByTestId('popped-widget-map.controls')).toBeVisible()
		await expect(page.getByTestId('popped-widget-map.minimap')).toBeVisible()

		// The popped cards share an edge strip container. Each popped card is
		// `[data-testid^="popped-widget-"][data-edge="top"]`; their common
		// parent strip is the parent `div.edge-scroll`. The top strip is
		// `flex-row overflow-x-auto` (Phase 4), so the scroll axis is **x**.
		const scrollable = await page.evaluate(() => {
			const card = document.querySelector('[data-testid^="popped-widget-"][data-edge="top"]')
			const strip = card?.parentElement
			if (!strip) return null
			return { scrollWidth: strip.scrollWidth, clientWidth: strip.clientWidth }
		})
		expect(scrollable, 'edge strip must exist').not.toBeNull()
		expect(scrollable.scrollWidth).toBeGreaterThan(scrollable.clientWidth)
	})

	test('re-docking the top widget to the right moves it between strips', async ({ page }) => {
		await launchSimulator(page)

		// Drop the lidar widget on top.
		await dragActiveFirstHandleToEdge(page, 'top')
		await expect(page.getByTestId('popped-widget-sensors.lidar')).toHaveAttribute(
			'data-edge',
			'top',
		)

		// Drop the map controls widget on top too (so the top strip is populated).
		await activateTab(page, 'map')
		await dragActiveFirstHandleToEdge(page, 'top')
		await expect(page.getByTestId('popped-widget-map.controls')).toHaveAttribute('data-edge', 'top')

		// Re-dock the lidar widget from top → right.
		await dragPoppedHandleToEdge(page, 'sensors.lidar', 'right')
		// The top strip no longer has 2 cards (lidar left it); the right strip
		// holds the lidar copy now.
		const topBoxes = await poppedBoxes(page, 'top')
		const rightBoxes = await poppedBoxes(page, 'right')
		expect(topBoxes.length).toBe(1)
		expect(rightBoxes.length).toBe(1)
	})
})
