#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import process from 'node:process'

const repoRoot = resolve(import.meta.dirname, '..')
const appDirectory = resolve(repoRoot, 'apps/drone-mission-planner')
const output = resolve(
	repoRoot,
	process.env.OUTPUT ?? 'apps/drone-mission-planner/drone-mission-planner.jpg',
)
const width = Number.parseInt(process.env.WIDTH ?? '1600', 10)
const height = Number.parseInt(process.env.HEIGHT ?? '1000', 10)
const port = Number.parseInt(process.env.PORT ?? '4174', 10)
const url = `http://127.0.0.1:${port}`

if (!existsSync(resolve(appDirectory, 'package.json'))) {
	throw new Error('Run this script from a robotics-lab checkout.')
}

const requireFromToolingPackage = createRequire(resolve(repoRoot, 'apps/simulator/package.json'))
const { chromium } = requireFromToolingPackage('@playwright/test')

process.stdout.write('Building the drone mission planner…\n')
const build = spawnSync('pnpm', ['build'], {
	cwd: appDirectory,
	stdio: 'inherit',
	shell: process.platform === 'win32',
})
if (build.status !== 0) process.exit(build.status ?? 1)

process.stdout.write(`Starting the preview server at ${url}…\n`)
const server = spawn(
	'pnpm',
	['exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', String(port)],
	{
		cwd: appDirectory,
		stdio: 'inherit',
		shell: process.platform === 'win32',
	},
)

let browser
try {
	browser = await chromium.launch({
		channel: process.env.BROWSER_CHANNEL ?? 'chrome',
		headless: true,
		args: ['--enable-unsafe-webgpu', '--use-angle=metal'],
	})
	const page = await browser.newPage({
		viewport: { width, height },
		deviceScaleFactor: 1,
		colorScheme: 'dark',
	})
	await page.goto(url, { waitUntil: 'networkidle' })
	await page.locator('[data-testid="mission-viewport"] canvas').waitFor({ timeout: 30_000 })
	await page.waitForTimeout(2_500)
	mkdirSync(dirname(output), { recursive: true })
	await page.screenshot({ path: output, type: 'jpeg', quality: 92 })
	process.stdout.write(`Wrote ${output}\n`)
} finally {
	await browser?.close()
	server.kill('SIGTERM')
}
