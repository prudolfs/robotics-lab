import { expect, type Page } from '@playwright/test'

/**
 * Reusable helpers for the E2E suite.
 *
 * Tests read like user stories: they interact only through the public UI
 * (keyboard, mouse, controls) and never touch Zustand or simulation state
 * directly. See docs/e2e.md.
 */

/** Launch the simulator and wait for the core UI to be ready. */
export async function launchSimulator(page: Page, base: string = '/') {
	await page.goto(base)
	await page.getByTestId('simulator-canvas').waitFor({ state: 'visible' })
	await page.getByTestId('simulator-hud').waitFor({ state: 'visible' })
	await page.getByTestId('robot-marker').waitFor({ state: 'attached' })
}

/** Read the simulation clock (seconds) from the HUD readout. */
export async function getSimTime(page: Page): Promise<number> {
	const text = await page.getByTestId('sim-time').textContent()
	const match = text?.match(/Sim time:\s*([0-9.]+)/)
	expect(match, `sim time readout not found: ${text}`).not.toBeNull()
	return Number.parseFloat(match?.[1])
}

/** Read the robot pose from the hidden debug readout: {x, y, heading (radians)}. */
export async function getRobotPose(page: Page): Promise<{ x: number; y: number; heading: number }> {
	const text = await page.getByTestId('robot-pose').textContent()
	const match = text?.match(/x:\s*(-?[0-9.]+)\s*y:\s*(-?[0-9.]+)\s*heading:\s*(-?[0-9.]+)°/)
	expect(match, `robot pose readout not found: ${text}`).not.toBeNull()
	return {
		x: Number.parseFloat(match?.[1]),
		y: Number.parseFloat(match?.[2]),
		heading: (Number.parseFloat(match?.[3]) * Math.PI) / 180,
	}
}

/**
 * Click the floor to place a navigation goal, at canvas-relative fractions
 * (fx/fy in [0, 1]). The GoalPicker raycasts floor hits; the actual world
 * coordinates are read back from the HUD after placement. Returns the placed
 * goal as the HUD displays it ({x, y}).
 */
export async function placeGoal(
	page: Page,
	fx = 0.65,
	fy = 0.6,
): Promise<{ x: number; y: number }> {
	const canvas = page.getByTestId('simulator-canvas')
	const r = await canvas.boundingBox()
	expect(r, 'simulator canvas not visible').not.toBeNull()
	// Wait for the R3F render loop to be alive before clicking the floor picker,
	// so the click reaches the raycaster instead of being swallowed by a
	// not-yet-attached scene. FPS > 0 is the observable signal the loop is up.
	await page
		.getByTestId('fps-counter')
		.filter({ hasText: /FPS: [1-9]/ })
		.waitFor({ state: 'visible', timeout: 15_000 })
	const cx = r?.x + r?.width * fx
	const cy = r?.y + r?.height * fy
	await page.mouse.click(cx, cy)
	// Auto: ON + an active goal should appear.
	await expect(page.getByTestId('active-goal')).not.toHaveText('—')
	const text = (await page.getByTestId('active-goal').textContent()) ?? ''
	const match = text.match(/\((-?[0-9.]+),\s*(-?[0-9.]+)\)/)
	expect(match, `active goal not parseable: ${text}`).not.toBeNull()
	return { x: Number.parseFloat(match?.[1]), y: Number.parseFloat(match?.[2]) }
}

/**
 * Queue (append) a navigation goal to the back of the queue via a
 * shift-click on the floor, at canvas-relative fractions (fx/fy in [0, 1]).
 *
 * Note: Playwright's `{ modifiers: ['Shift'] }` option does not surface on the
 * R3F pointer event that the GoalPicker receives, so we physically press Shift
 * via the keyboard around the click instead.
 */
export async function queueGoal(page: Page, fx = 0.65, fy = 0.6): Promise<void> {
	const canvas = page.getByTestId('simulator-canvas')
	const r = await canvas.boundingBox()
	expect(r, 'simulator canvas not visible').not.toBeNull()
	await page
		.getByTestId('fps-counter')
		.filter({ hasText: /FPS: [1-9]/ })
		.waitFor({ state: 'visible', timeout: 15_000 })
	const cx = r?.x + r?.width * fx
	const cy = r?.y + r?.height * fy
	await page.keyboard.down('Shift')
	await page.mouse.click(cx, cy)
	await page.keyboard.up('Shift')
}

/** Read the remaining distance to the active goal (metres), or null if none. */
export async function getGoalDistance(page: Page): Promise<number | null> {
	const el = page.getByTestId('distance')
	const text = (await el.textContent()) ?? ''
	if (text.includes('—')) return null
	const match = text.match(/([0-9.]+)\s*m/)
	expect(match, `distance not parseable: ${text}`).not.toBeNull()
	return Number.parseFloat(match?.[1])
}

/** Read the queued-goal count reported by the HUD. */
export async function getGoalCount(page: Page): Promise<number> {
	const text = (await page.getByTestId('goal-count').textContent()) ?? ''
	const n = Number.parseInt(text, 10)
	return Number.isFinite(n) ? n : 0
}

/** Read the navigation controller status badge text. */
export async function getNavStatus(page: Page): Promise<string> {
	return ((await page.getByTestId('nav-status').textContent()) ?? '').trim()
}

/** Reset the world and wait for the robot to settle. */
export async function resetWorld(page: Page) {
	await page.getByTestId('robot-debug').getByRole('button', { name: /reset/i }).click()
	await waitForIdle(page)
}

/**
 * Wait for the simulation to be idle / stable.
 *
 * We avoid timing assumptions: we wait until the simulation clock is updating
 * (i.e. the loop is running and the app is responsive).
 */
export async function waitForIdle(page: Page, opts: { timeoutMs?: number } = {}) {
	const timeout = opts.timeoutMs ?? 10_000
	// The hero signal of idleness: the FPS counter reports a value > 0,
	// meaning an animation loop is alive and the app rendered at least once.
	await page
		.getByTestId('fps-counter')
		.filter({ hasText: /FPS: [1-9]/ })
		.waitFor({ state: 'visible', timeout })
}
