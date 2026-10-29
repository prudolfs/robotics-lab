import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const capture = fileURLToPath(new URL('../../../docs/greenhouse-demo/phase3/', import.meta.url))

test('connects to Python, renders WebGPU and acknowledges a keyboard reset', async ({ page }) => {
	const errors: string[] = []
	page.on('pageerror', (error) => errors.push(String(error)))
	await page.goto('/')
	await expect(page.getByTestId('connection-status')).toHaveText('Connected')
	await expect(page.getByTestId('renderer-status')).toHaveText('WebGPU active')
	await expect(page.locator('canvas')).toHaveCount(1)
	await expect(page.getByTestId('session-generation')).toHaveText('0')
	await page.getByRole('button', { name: 'Restart seed' }).focus()
	await page.keyboard.press('Space')
	await expect(page.getByTestId('session-generation')).toHaveText('1')
	await expect(page.getByRole('status')).toHaveText('Scenario reset.')
	await expect(page.getByRole('button', { name: 'Restart seed' })).toBeEnabled()
	await expect(page.getByText('Scripted reference controller.', { exact: false })).toBeVisible()
	expect(errors).toEqual([])
	if (process.env.GREENHOUSE_CAPTURE) {
		await mkdir(capture, { recursive: true })
		await page.screenshot({ path: `${capture}/connected.png` })
		await page.setViewportSize({ width: 390, height: 844 })
		await page.waitForFunction(() => {
			const canvas = document.querySelector('canvas')
			return canvas && canvas.width === canvas.clientWidth && canvas.height === canvas.clientHeight
		})
		await page.evaluate(
			() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
		)
		await page.screenshot({ path: `${capture}/mobile.png`, fullPage: true })
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
	}
})

test('shows loading while the server is responding', async ({ page }) => {
	await page.route('**/api/v1/greenhouse/health', async (route) => {
		await new Promise((resolve) => setTimeout(resolve, 1200))
		await route.continue()
	})
	await page.goto('/')
	await expect(page.getByTestId('connection-status')).toHaveText('Connecting…')
	await expect(page.getByRole('button', { name: 'Restart seed' })).toBeDisabled()
	await expect(page.getByTestId('connection-status')).toHaveText('Connected')
})

test('rejects an incompatible HTTP response using the Pydantic schema', async ({ page }) => {
	await page.route('**/api/v1/greenhouse/health', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ api_version: '1', server_version: 42 }),
		}),
	)
	await page.goto('/')
	await expect(page.getByTestId('connection-status')).toHaveText('Server unavailable')
	await expect(page.getByRole('status')).toContainText('incompatible HTTP response')
	await expect(page.getByRole('button', { name: 'Restart seed' })).toBeDisabled()
})

test('explains an unavailable server and retries without a reload', async ({ page }) => {
	await page.route('**/api/v1/greenhouse/health', (route) =>
		route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
	)
	await page.goto('/')
	await expect(page.getByTestId('connection-status')).toHaveText('Server unavailable')
	await expect(page.getByRole('button', { name: 'Restart seed' })).toBeDisabled()
	await expect(page.getByText('pnpm dev:greenhouse', { exact: false })).toBeVisible()
	if (process.env.GREENHOUSE_CAPTURE)
		await page.screenshot({ path: `${capture}/server-unavailable.png` })
	await page.unroute('**/api/v1/greenhouse/health')
	await page.getByRole('button', { name: 'Retry connection' }).click()
	await expect(page.getByTestId('connection-status')).toHaveText('Connected')
})

test('detects a closed real session and reconnects to a fresh generation', async ({
	page,
	request,
}) => {
	let sessionId = ''
	page.on('websocket', (socket) => {
		sessionId = new URL(socket.url()).pathname.split('/').at(-2) ?? ''
	})
	await page.goto('/')
	await expect(page.getByTestId('connection-status')).toHaveText('Connected')
	await page.getByRole('button', { name: 'Restart seed' }).click()
	await expect(page.getByTestId('session-generation')).toHaveText('1')
	const oldSessionId = sessionId
	expect(oldSessionId).not.toBe('')
	// Simulate service-side session expiry; normal control remains through public UI.
	expect((await request.delete(`/api/v1/greenhouse/sessions/${oldSessionId}`)).status()).toBe(204)
	await expect(page.getByTestId('connection-status')).toHaveText('Server unavailable')
	await page.getByRole('button', { name: 'Retry connection' }).click()
	await expect(page.getByTestId('connection-status')).toHaveText('Connected')
	await expect(page.getByTestId('session-generation')).toHaveText('0')
	expect(sessionId).not.toBe(oldSessionId)
})

test('keeps connection controls usable when WebGPU is unavailable', async ({ page }) => {
	await page.addInitScript(() =>
		Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true }),
	)
	await page.goto('/')
	await expect(page.getByTestId('connection-status')).toHaveText('Connected')
	await expect(page.getByTestId('renderer-status')).toHaveText('WebGPU is unavailable')
	await expect(page.locator('canvas')).toHaveCount(0)
	await page.getByRole('button', { name: 'Restart seed' }).click()
	await expect(page.getByTestId('session-generation')).toHaveText('1')
	if (process.env.GREENHOUSE_CAPTURE)
		await page.screenshot({ path: `${capture}/webgpu-unavailable.png` })
})
