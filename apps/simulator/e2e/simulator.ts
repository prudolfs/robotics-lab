// Deterministic world-space E2E interaction.
//
// Implements the design in docs/e2e-world-click.md: tests describe user intent
// in world coordinates, never pixel coordinates. This module owns the small
// amount of glue between Playwright and the simulator's renderer bridge
// (`window.__E2E__`, see packages/rendering/src/e2e-bridge.tsx):
//
//   world coords ──▶ window.__E2E__.worldToScreen ──▶ page.mouse.click
//
// It also enforces a HUD "safe zone" so a projected click is never silently
// dropped by a `pointer-events-auto` overlay (sidebar, nav HUD, minimap…):
// every click target is first checked against the on-screen rectangles of the
// interactive HUDs, and an informative error is thrown if it would collide.
// If a fallback point is supplied, the helper nudges the click to a clear spot
// in the floor instead of failing.
//
// The fixture never mutates simulation state: it only performs real browser
// mouse / keyboard events. Read the design doc for the full rationale.

import { expect, type Page } from '@playwright/test'
import { launchSimulator } from './fixtures'

/** A 2D world point, in metres, in the simulation's coordinate system. */
export type WorldPos = { x: number; y: number }

/** Options shared by every world-space click. */
export type WorldClickOptions = {
	/** Button to press (default left). */
	button?: 'left' | 'right' | 'middle'
	/** When true, hold Shift during the click (the public UI queues a goal on
	 *  shift-click rather than replacing the queue). */
	shift?: boolean
	/** Throw with a clear message if the projected point lands on a HUD. When
	 *  a fallback is supplied instead, nudge the click onto the floor away from
	 *  any HUD overlap instead of erroring. Default: true (error). */
	hudCollision?: 'error' | 'nudge'
	/** Optional fallback world point used when the primary target is hidden by
	 *  a HUD — `placeGoal` / `queueGoal` pass the robot's location so a click
	 *  blocked by the nav HUD degrades to "near the robot" instead of failing. */
	fallback?: WorldPos
	/** Override the visibility / HUD-collision timeout. Default 10_000ms. */
	timeoutMs?: number
}

/** An interactive HUD rectangle, in canvas-relative CSS pixels. */
type HRect = { x: number; y: number; width: number; height: number }

// `window.__E2E__` is a non-serializable object (its members are closures over
// the live Three camera), so we always probe it *inside* the page via
// `evaluate`. This predicate takes a primitive shape returned from the page.
const bridgeReady = (v: unknown): v is 'function' => v === 'function'

/**
 * The simulator under test. Construct via `await launchSimulatorForWorld(page)`
 * (we keep the name distinct from the legacy `launchSimulator` helper so the
 * migration can proceed spec-by-spec). Every method performs *real* browser
 * events; none mutate simulation state directly.
 */
export class Simulator {
	readonly page: Page

	constructor(page: Page) {
		this.page = page
	}

	/** Whether the renderer bridge is installed (probed inside the page). */
	async isBridgeReady(): Promise<boolean> {
		const v = await this.page.evaluate(() => typeof window.__E2E__?.worldToScreen)
		return bridgeReady(v)
	}

	/** Wait until the renderer is producing frames and the bridge is live. */
	async waitForReady(timeoutMs = 15_000) {
		await this.page
			.getByTestId('fps-counter')
			.filter({ hasText: /FPS: [1-9]/ })
			.waitFor({ state: 'visible', timeout: timeoutMs })
		// Bridge installs on mount; also assert the API callable is present.
		await expect
			.poll(async () => await this.isBridgeReady(), {
				timeout: timeoutMs,
				intervals: [100],
			})
			.toBe(true)
	}

	/** Project a world point to absolute browser-space pixels (ready for
	 *  `page.mouse.click`). Returns null when the point is off-screen / behind
	 *  the camera. */
	async worldToClient(p: WorldPos): Promise<{ x: number; y: number } | null> {
		const [rect, screen] = await this.page.evaluate((w) => {
			const api = window.__E2E__
			if (!api) return [null, null] as const
			return [api.canvasRect(), api.worldToScreen(w)] as const
		}, p)
		if (!rect || !screen) return null
		return { x: rect.x + screen.x, y: rect.y + screen.y }
	}

	/** The interactive HUD rectangles that overlap the renderer canvas, in
	 *  canvas-relative CSS pixels. Computed live from the DOM so the helper
	 *  adapts automatically as HUDs are added or repositioned — no test ever
	 *  hardcodes a safe region. */
	async hudRects(): Promise<HRect[]> {
		const canvas = this.page.getByTestId('simulator-canvas')
		const cb = await canvas.boundingBox()
		if (!cb) return []
		// Any element with pointer-events-auto that sits over the canvas can
		// swallow a click before the raycaster sees it.
		const els = this.page.locator('[class*="pointer-events-auto"]')
		const boxes: HRect[] = []
		const count = await els.count()
		for (let i = 0; i < count; i++) {
			const b = await els.nth(i).boundingBox()
			if (!b) continue
			if (b.width < 1 || b.height < 1) continue
			// Skip elements that are fully off-canvas.
			const intersects =
				b.x < cb.x + cb.width &&
				b.x + b.width > cb.x &&
				b.y < cb.y + cb.height &&
				b.y + b.height > cb.y
			if (!intersects) continue
			boxes.push({ x: b.x - cb.x, y: b.y - cb.y, width: b.width, height: b.height })
		}
		return boxes
	}

	/** True when a canvas-relative point is inside a HUD rectangle. */
	async hitsHud(canvasPoint: { x: number; y: number }, rects?: HRect[]): Promise<boolean> {
		const rs = rects ?? (await this.hudRects())
		return rs.some(
			(r) =>
				canvasPoint.x >= r.x &&
				canvasPoint.x <= r.x + r.width &&
				canvasPoint.y >= r.y &&
				canvasPoint.y <= r.y + r.height,
		)
	}

	/**
	 * Click a world point. Projects the world coordinate to screen pixels via
	 * the renderer, verifies it is visible and not covered by a HUD, then
	 * performs a *real* mouse click.
	 *
	 * If the projected point collides with a HUD, behaviour is determined by
	 * `hudCollision`:
	 *   - `'error'` (default): throw an informative error.
	 *   - `'nudge'`: if a `fallback` world point is provided and clear, click
	 *     that instead; otherwise error.
	 */
	async clickWorld(p: WorldPos, opts: WorldClickOptions = {}): Promise<void> {
		const {
			button = 'left',
			shift = false,
			hudCollision = 'error',
			fallback,
			timeoutMs = 10_000,
		} = opts
		await this.waitForReady(timeoutMs)

		const rects = await this.hudRects()
		const target = await this.resolveClickableTarget(p, rects, hudCollision, fallback)

		const client = await this.worldToClient(target)
		if (!client) {
			throw new Error(
				`clickWorld({ x: ${p.x}, y: ${p.y} }) → projected point is off-screen / behind camera`,
			)
		}
		if (shift) await this.page.keyboard.down('Shift')
		await this.page.mouse.click(client.x, client.y, { button })
		if (shift) await this.page.keyboard.up('Shift')
	}

	/**
	 * Drag from one world point to another (real mouse moves + presses).
	 * Uses a few intermediate steps so orbit controls / drag handlers receive
	 * a believable gesture rather than a single teleport.
	 */
	async dragWorld(from: WorldPos, to: WorldPos, opts: WorldClickOptions = {}): Promise<void> {
		const { button = 'left', timeoutMs = 10_000 } = opts
		await this.waitForReady(timeoutMs)
		const a = await this.resolveClickableTarget(from, await this.hudRects(), 'error', opts.fallback)
		const b = await this.resolveClickableTarget(to, await this.hudRects(), 'error', opts.fallback)
		const start = await this.worldToClient(a)
		const end = await this.worldToClient(b)
		if (!start || !end) throw new Error('dragWorld → endpoint is off-screen / behind camera')
		await this.page.mouse.move(start.x, start.y)
		await this.page.mouse.down({ button })
		const steps = 8
		for (let i = 1; i <= steps; i++) {
			const t = i / steps
			await this.page.mouse.move(start.x + (end.x - start.x) * t, start.y + (end.y - start.y) * t)
		}
		await this.page.mouse.up({ button })
	}

	/**
	 * Place a navigation goal at a world point (replaces the queue), through the
	 * same real click a user would make.
	 */
	async placeGoal(p: WorldPos, opts: Omit<WorldClickOptions, 'shift'> = {}): Promise<WorldPos> {
		await this.clickWorld(p, { ...opts, shift: false })
		// Auto: ON + an active goal should appear. Read back the placed
		// coordinate so tests can assert on the exact goal rather than guess.
		const el = this.page.getByTestId('active-goal')
		await expect
			.poll(async () => (await el.textContent()) ?? '', {
				timeout: opts.timeoutMs ?? 10_000,
				intervals: [100],
			})
			.not.toBe('—')
		const text = (await el.textContent()) ?? ''
		const match = text.match(/\((-?[0-9.]+),\s*(-?[0-9.]+)\)/)
		expect(match, `active goal not parseable: ${text}`).not.toBeNull()
		return { x: Number.parseFloat(match?.[1]), y: Number.parseFloat(match?.[2]) }
	}

	/** Append a goal to the queue (shift-click). */
	async queueGoal(p: WorldPos, opts: Omit<WorldClickOptions, 'shift'> = {}): Promise<void> {
		await this.clickWorld(p, { ...opts, shift: true })
	}

	// ── HUD-read conveniences (world-space aware readouts) ──────────────────

	/** The current robot pose from the debug HUD: { x, y, heading (radians) }. */
	async robotPose(): Promise<{ x: number; y: number; heading: number }> {
		const text = (await this.page.getByTestId('robot-pose').textContent()) ?? ''
		const match = text.match(/x:\s*(-?[0-9.]+)\s*y:\s*(-?[0-9.]+)\s*heading:\s*(-?[0-9.]+)°/)
		expect(match, `robot pose readout not found: ${text}`).not.toBeNull()
		return {
			x: Number.parseFloat(match?.[1]),
			y: Number.parseFloat(match?.[2]),
			heading: (Number.parseFloat(match?.[3]) * Math.PI) / 180,
		}
	}

	/** Queued-goal count as the navigation HUD reports it. */
	async goalCount(): Promise<number> {
		const text = (await this.page.getByTestId('goal-count').textContent()) ?? ''
		const n = Number.parseInt(text, 10)
		return Number.isFinite(n) ? n : 0
	}

	/** Navigation controller status badge text (e.g. 'manual', 'driving'). */
	async navStatus(): Promise<string> {
		return ((await this.page.getByTestId('nav-status').textContent()) ?? '').trim()
	}

	/** Active-goal readout text ('—' when the queue is empty). */
	async activeGoalText(): Promise<string> {
		return ((await this.page.getByTestId('active-goal').textContent()) ?? '').trim()
	}

	/** Wait until the goal queue drains and autonomy returns to manual. */
	async waitForGoalReached(timeoutMs = 30_000): Promise<void> {
		await expect
			.poll(async () => await this.goalCount(), { timeout: timeoutMs, intervals: [250] })
			.toBe(0)
		await expect
			.poll(async () => await this.navStatus(), { timeout: timeoutMs, intervals: [250] })
			.toBe('manual')
		await expect(this.page.getByTestId('active-goal')).toHaveText('—')
	}

	// ── internal ───────────────────────────────────────────────────────────

	/** Resolve a world coordinate to a click target, applying HUD policy. */
	private async resolveClickableTarget(
		p: WorldPos,
		rects: HRect[],
		hudCollision: 'error' | 'nudge',
		fallback?: WorldPos,
	): Promise<WorldPos> {
		const [screen] = await this.page.evaluate((w) => {
			const api = window.__E2E__
			if (!api) return [null] as const
			return [api.worldToScreen(w)] as const
		}, p)
		if (!screen) {
			throw new Error(`clickWorld({ x: ${p.x}, y: ${p.y} }) → off-screen / behind camera`)
		}
		if (!(await this.hitsHud(screen, rects))) return p

		const describe = (r: HRect) =>
			`{x:${Math.round(r.x)},y:${Math.round(r.y)},w:${Math.round(r.width)},h:${Math.round(r.height)}}`
		const where = `world{${p.x},${p.y}} → screen{${Math.round(screen.x)},${Math.round(
			screen.y,
		)}} overlaps HUD ${rects.map(describe).join(', ')}`
		if (hudCollision === 'nudge' && fallback) {
			const [fbScreen] = await this.page.evaluate((w) => {
				const api = window.__E2E__
				if (!api) return [null] as const
				return [api.worldToScreen(w)] as const
			}, fallback)
			if (fbScreen && !(await this.hitsHud(fbScreen, rects))) {
				return fallback
			}
			throw new Error(`clickWorld fallback also hit a HUD: ${where}`)
		}
		throw new Error(`clickWorld target occluded by a HUD — ${where}`)
	}
}

/**
 * Launch the simulator and return a `Simulator` driver. Composes the legacy
 * in-app wait-for-ready helpers so we keep one definition of "launched".
 */
export async function launchSimulatorForWorld(page: Page): Promise<Simulator> {
	await launchSimulator(page)
	const sim = new Simulator(page)
	await sim.waitForReady()
	return sim
}
