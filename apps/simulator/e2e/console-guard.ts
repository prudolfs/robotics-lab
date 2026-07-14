import type { ConsoleMessage, Page } from '@playwright/test'

/**
 * Shared console / error / WebGL hygiene for the E2E suite.
 *
 * Fails a test on any of:
 *   - `console.error` console messages
 *   - unhandled promise rejections (`pageerror`)
 *   - failed network requests (favicon ignored)
 *   - WebGL-context-loss telemetry — see below for the whitelist.
 *
 * The WebGL-context rule historically caught **any** console message whose
 * text contained "WebGL" and "context". That was fine through Phase 10
 * because none of those tests intentionally unmounted an R3F `<Canvas>`.
 * Phase 11 toggles the robot camera viewport in a loop, which mounts /
 * unmounts a secondary `<Canvas>` each round. R3F v9 calls
 * `gl.forceContextLoss()` on `<Canvas>` unmount (it deliberately releases
 * the GPU resource), which dispatches `webglcontextlost` on the canvas and
 * causes THREE.js's `onContextLost` handler to log — at `console.log`
 * level, NOT `console.error` — the benign debug line
 * `THREE.WebGLRenderer: Context Lost.`. That log is the *expected*
 * GPU-release signal for a deliberate scene-graph teardown, not a
 * regression: the WebGL system itself stays healthy (a fresh
 * `canvas.getContext('webgl')` succeeds after the teardown). A genuine
 * context-loss regression on a *live* canvas surfaces through a different
 * path — `console.error`-level Chrome GPU messages, the
 * `webglcontextcreationerror` DOM event, or other side channels — all of
 * which the guard still catches (the `console.error` rule is unchanged, and
 * the WebGL-context rule now only whitelists the exact R3F/THREE teardown
 * *log* line, leaving error-level messages tripping the gate).
 *
 * Usage in a spec file:
 *   import { setupConsoleGuard, teardownConsoleGuard } from './console-guard'
 *
 *   test.beforeEach(async ({ page }) => { setupConsoleGuard(page) })
 *   test.afterEach(async () => { teardownConsoleGuard() })
 */

const failures: string[] = []
let listenerInstalled = false

function installListeners(page: Page) {
	if (listenerInstalled) return
	listenerInstalled = true

	page.on('console', (msg: ConsoleMessage) => {
		if (msg.type() === 'error') {
			failures.push(`console.error: ${msg.text()}`)
		}
	})

	page.on('pageerror', (err: Error) => {
		failures.push(`pageerror: ${err.message}`)
	})

	page.on('requestfailed', (req) => {
		const url = req.url()
		if (url.endsWith('/favicon.ico')) return
		failures.push(`requestfailed: ${url} — ${req.failure()?.errorText ?? ''}`)
	})

	page.on('console', (msg: ConsoleMessage) => {
		const text = msg.text()
		if (text.includes('WebGL') && text.toLowerCase().includes('context')) {
			// Whitelist the benign R3F/THREE teardown log that fires whenever
			// a `<Canvas>` is intentionally unmounted (e.g. toggling the Phase
			// 11 robot camera viewport off): R3F calls `gl.forceContextLoss()`
			// on unmount, which dispatches `webglcontextlost`; THREE.js's
			// `onContextLost` handler then emits this *log*-level debug line.
			// That is the *expected* GPU-release signal for a deliberate
			// teardown, not a regression. Genuine context-loss regressions on
			// a *live* canvas surface as `console.error`-level Chrome GPU
			// messages (caught by the rule above) or `webglcontextcreationerror`
			// console messages (also caught here). See the file-level JSDoc.
			const isR3fTeardownLog =
				msg.type() !== 'error' && text.includes('THREE.WebGLRenderer: Context Lost.')
			if (!isR3fTeardownLog) failures.push(`webgl context issue: ${text}`)
		}
	})
}

/** Call from `test.beforeEach(async ({ page }) => { ... })` in every spec. */
export function setupConsoleGuard(page: Page): void {
	failures.length = 0
	installListeners(page)
}

/** Call from `test.afterEach(async () => { ... })` in every spec. */
export function teardownConsoleGuard(): void {
	if (failures.length > 0) {
		throw new Error(`Console / browser errors detected:\n${failures.join('\n')}`)
	}
}
