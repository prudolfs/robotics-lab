import type { ConsoleMessage, Page } from '@playwright/test'

/**
 * Shared console / error / WebGL hygiene for the E2E suite.
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
			failures.push(`webgl context issue: ${text}`)
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
