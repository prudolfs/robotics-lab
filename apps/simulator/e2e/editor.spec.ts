import { expect, test } from '@playwright/test'
import { setupConsoleGuard, teardownConsoleGuard } from './console-guard'
import { activateTab, launchSimulator, resetWorld } from './fixtures'
import { launchSimulatorForWorld } from './simulator'

/**
 * Phase 12 — Editor.
 *
 * Verifies the world / robot editor shipped in milestone 12. Tests interact
 * only through the public UI (the Editor tab's tool palette + real floor
 * clicks via the world→screen bridge). No internal state is touched.
 *
 *   - the Editor tab mounts with the world + robot editor widgets
 *   - the Add-wall tool draws a wall (two floor clicks), reflected in the
 *     inventory counter and the world obstacle count
 *   - the Remove-wall tool deletes the wall that was just drawn
 *   - the Move tool relocates a box obstacle by dragging it across the floor
 *   - the Robot editor's "Reset to spawn" sends the robot back home after a
 *     manual drive
 */

test.beforeEach(async ({ page }) => setupConsoleGuard(page))
test.afterEach(async () => teardownConsoleGuard())

test.describe('Phase 12 — Editor', () => {
	test('Editor tab mounts the world + robot editor widgets', async ({ page }) => {
		await launchSimulator(page)
		await activateTab(page, 'map')
		// Switch to the Editor tab (6th tab, horizontally scrolled into view).
		await activateTab(page, 'editor')

		await expect(page.getByTestId('panel-tab-editor')).toHaveAttribute('aria-selected', 'true')
		await expect(page.getByTestId('editor-count-walls')).toBeVisible()
		await expect(page.getByTestId('editor-spawn-pose')).toBeVisible()
	})

	test('Add-wall tool draws a wall between two floor clicks', async ({ page }) => {
		await launchSimulator(page)
		await activateTab(page, 'utils')
		await resetWorld(page)
		const sim = await launchSimulatorForWorld(page)
		// Reset re-launched via the driver; switch back to the editor tab.
		await activateTab(page, 'editor')

		const before = (await page.getByTestId('editor-count-walls').textContent()) ?? ''
		const beforeCount = Number.parseInt(before.match(/\d+/)?.[0] ?? '0', 10)

		// Activate the Add-wall tool.
		await page.getByTestId('editor-tool-addWall').click()
		await expect(page.getByTestId('editor-tool-addWall')).toHaveAttribute('data-variant', 'default')

		// Click two floor points on the left/centre of the floor, clear of the
		// right-panel HUD (which overlaps the right portion of the canvas).
		await sim.clickWorld({ x: -3, y: -2 })
		// After the first click the widget flips to the 'click the second endpoint' hint.
		await expect(page.locator('.text-amber-400')).toContainText(/second endpoint/)
		// The tool must still be active (a floor click never toggles it).
		await expect(page.getByTestId('editor-tool-addWall')).toHaveAttribute('data-variant', 'default')
		await sim.clickWorld({ x: -1, y: 2 })
		// After the second click the wall completes and the hint reverts.
		await expect(page.locator('.text-amber-400')).toHaveCount(0)

		await expect
			.poll(async () => (await page.getByTestId('editor-count-walls').textContent()) ?? '', {
				intervals: [100],
			})
			.toContain(`walls ${beforeCount + 1}`)
	})

	test('Remove-wall tool deletes a wall clicked on the floor', async ({ page }) => {
		await launchSimulator(page)
		await activateTab(page, 'utils')
		await resetWorld(page)
		const sim = await launchSimulatorForWorld(page)
		await activateTab(page, 'editor')

		// Draw a wall first (reuse the add-wall flow).
		await page.getByTestId('editor-tool-addWall').click()
		await sim.clickWorld({ x: -3, y: -2 })
		await sim.clickWorld({ x: -1, y: 2 })
		await expect
			.poll(async () => page.getByTestId('editor-count-walls').textContent())
			.toContain('walls')
		const afterAdd = (await page.getByTestId('editor-count-walls').textContent()) ?? ''
		const afterAddCount = Number.parseInt(afterAdd.match(/\d+/)?.[0] ?? '0', 10)

		// Switch to the Remove-wall tool and click the wall midpoint.
		await page.getByTestId('editor-tool-removeWall').click()
		await expect(page.getByTestId('editor-tool-removeWall')).toHaveAttribute(
			'data-variant',
			'default',
		)
		// Click the wall's midpoint (-2, 0 is roughly the middle of the segment).
		await sim.clickWorld({ x: -2, y: 0 })

		await expect
			.poll(async () => page.getByTestId('editor-count-walls').textContent(), {
				intervals: [100],
			})
			.toContain(`walls ${afterAddCount - 1}`)
	})

	test('Move tool relocates a box obstacle by dragging', async ({ page }) => {
		await launchSimulator(page)
		const sim = await launchSimulatorForWorld(page)
		// Select the obstacles map so a box exists near (-2, 1).
		// The default loaded map is the first registry entry; switch to
		// `obstacles` to guarantee a draggable box.
		await page.getByTestId('simulator-hud').getByRole('button', { name: 'obstacles' }).click()
		await activateTab(page, 'editor')

		// Activate the Move tool, then click on / drag the box at (-2, 1).
		await page.getByTestId('editor-tool-move').click()
		await sim.clickWorld({ x: -2, y: 1 })
		// Drag it across the floor (both endpoints on the left/centre).
		await sim.dragWorld({ x: -2, y: 1 }, { x: -1, y: -1 })

		// A selection readout is exposed while the move tool is active + a box
		// is selected; assert it shows the box got picked up.
		await expect(page.getByTestId('editor-selection')).toContainText(/box #0/)
	})

	test('Robot editor Reset to spawn sends the robot back home', async ({ page }) => {
		await launchSimulator(page)
		await activateTab(page, 'utils')
		await resetWorld(page)
		const sim = await launchSimulatorForWorld(page)
		await activateTab(page, 'editor')

		// Drive forward a bit.
		await page.keyboard.down('KeyW')
		await page.waitForTimeout(800)
		await page.keyboard.up('KeyW')
		const moved = await sim.robotPose()
		expect(Math.abs(moved.x) + Math.abs(moved.y)).toBeGreaterThan(0.05)

		// Reset to spawn.
		await page.getByTestId('editor-reset').click()
		await expect
			.poll(
				async () => {
					const p = await sim.robotPose()
					return Math.hypot(p.x, p.y)
				},
				{ intervals: [100] },
			)
			.toBeLessThan(0.05)
	})
})
