import { expect, test } from '@playwright/test'
import { createWorld } from '@robotics-lab/core'
import { loadMap } from '@robotics-lab/maps'
import { DEFAULT_ROBOT_PARAMS } from '@robotics-lab/robot'
import { motionIsClear, robotFootprintRadius } from '../src/sim/collision'
import { setupConsoleGuard, teardownConsoleGuard } from './console-guard'
import { activateTab } from './fixtures'
import { launchSimulatorForWorld } from './simulator'

test.beforeEach(async ({ page }) => setupConsoleGuard(page))
test.afterEach(() => teardownConsoleGuard())

test('an unsafe wall goal stops, explains why, and can be replaced with a valid goal', async ({
	page,
}) => {
	const sim = await launchSimulatorForWorld(page)
	await activateTab(page, 'nav')
	const before = await sim.robotPose()
	await sim.placeGoal({ x: -3.9, y: 0 })
	await expect(page.getByTestId('nav-status')).toHaveText('blocked')
	await expect(page.getByTestId('navigation-plan')).toContainText('Choose a goal farther')
	await expect(page.getByTestId('navigation-summary')).toHaveText('BLOCKED')
	await page.waitForTimeout(500)
	expect(await sim.robotPose()).toEqual(before)
	await expect(page.getByTestId('goal-count')).toHaveText('1')
	await sim.placeGoal({ x: 1, y: 0 })
	await expect(page.getByTestId('navigation-plan')).toContainText('A* route following')
	await sim.waitForGoalReached(30000)
})

test('the robot follows an A* detour around a box without clipping it', async ({ page }) => {
	test.setTimeout(90000)
	const sim = await launchSimulatorForWorld(page)
	await page.getByRole('button', { name: 'obstacles', exact: true }).click()
	await activateTab(page, 'nav')
	const goal = { x: 4.2, y: -0.5 }
	await page.getByTestId('panel-toggle').click()
	await expect
		.poll(async () => {
			const point = await sim.worldToClient(goal)
			const panel = await page.getByTestId('right-panel').boundingBox()
			return !!point && !!panel && point.x < panel.x
		})
		.toBe(true)
	await sim.placeGoal(goal)
	await page.getByTestId('panel-toggle').click()
	await expect(page.getByTestId('navigation-target')).toBeVisible()
	await expect(page.getByTestId('navigation-plan')).toContainText('A* route following')
	const world = createWorld(loadMap('obstacles'))
	// HUD pose readouts round to centimetres; allow 2cm for their quantization.
	const radius = robotFootprintRadius(DEFAULT_ROBOT_PARAMS) - 0.02
	let before = await sim.robotPose()
	let deviation = 0
	const deadline = Date.now() + 60000
	while ((await sim.goalCount()) > 0 && Date.now() < deadline) {
		await page.waitForTimeout(100)
		const pose = await sim.robotPose()
		expect(motionIsClear(world, before, pose, radius)).toBe(true)
		deviation = Math.max(deviation, Math.abs(pose.y - (goal.y / goal.x) * pose.x))
		before = pose
	}
	expect(await sim.goalCount()).toBe(0)
	expect(deviation).toBeGreaterThan(0.25)
})

test('Clean Room starts an A* coverage route and Stop clears it', async ({ page }) => {
	await launchSimulatorForWorld(page)
	await activateTab(page, 'nav')
	await page.getByTestId('coverage-start').click()
	await expect(page.getByTestId('navigation-plan')).toContainText('A* coverage route')
	await expect(page.getByTestId('navigation-target')).toBeVisible()
	await page.getByTestId('coverage-cancel').click()
	await expect(page.getByTestId('goal-count')).toHaveText('0')
	await expect(page.getByTestId('navigation-plan')).toContainText('Manual control')
})
