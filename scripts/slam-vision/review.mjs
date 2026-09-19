import { chromium } from '../../apps/slam-demo/node_modules/@playwright/test/index.mjs'
import { writeFile } from 'node:fs/promises'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const errors = []
try {
 const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
 page.on('pageerror', e => errors.push(e.message))
 await page.goto('http://127.0.0.1:8082')
 await page.getByTestId('vo-status').filter({ hasText: 'initializing' }).waitFor()
 await page.getByRole('button', { name: 'Run inspection', exact: true }).click()
 await page.waitForTimeout(7000)
 await page.getByRole('button', { name: 'Pause', exact: true }).click()
 await page.waitForTimeout(500)
 const inspector = page.getByRole('region', { name: 'Visual odometry', exact: true })
 await inspector.scrollIntoViewIfNeeded()
 await page.screenshot({ path: 'docs/slam-demo/phase4/tracking.png', fullPage: true })
 const tracking = await inspector.innerText()
 await page.locator('.vo-overlay').screenshot({ path: 'docs/slam-demo/phase4/features.png' })
 await page.setViewportSize({ width: 390, height: 844 })
 await page.screenshot({ path: 'docs/slam-demo/phase4/mobile.png', fullPage: true })
 await writeFile('docs/slam-demo/phase4/browser-review.json', JSON.stringify({ browser: browser.version(), tracking, errors }, null, 2) + '\n')
 if(errors.length) throw Error(errors.join('\n'))
} finally { await browser.close() }
