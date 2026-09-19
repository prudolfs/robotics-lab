import { chromium } from '../../apps/simulator/node_modules/@playwright/test/index.mjs'
import { writeFile, mkdir } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
const browser = await chromium.launch({
	channel: 'chrome',
	headless: true,
	args: ['--enable-unsafe-webgpu'],
})
try {
	const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
	page.on('pageerror', (e) => console.error(e.message))
	page.on('console', (m) => {
		if (m.type() === 'error') console.error(m.text())
	})
	await page.goto('http://127.0.0.1:5180')
	await page.waitForFunction(() => window.__report || window.__error, {}, { timeout: 90000 })
	const error = await page.evaluate(() => window.__error)
	if (error) throw Error(error)
	const report = await page.evaluate(() => window.__report)
	report.measuredAt = new Date().toISOString()
	report.referenceHost = 'MacBook Pro Mac15,7; M3 Pro 12 CPU / 18 GPU cores; 18 GB; macOS 26.5.1'
	for (const name of ['typescript', 'opencv']) {
		if (report[name].error || report[name].results.length !== 4)
			throw Error(name + ' pipeline failed')
	}
	await mkdir('docs/slam-demo/phase0', { recursive: true })
	await writeFile('docs/slam-demo/phase0/measurements.json', JSON.stringify(report, null, 2) + '\n')
	await page.screenshot({ path: 'docs/slam-demo/phase0/browser-probe.png', fullPage: false })
	const encoded = await page.evaluate(() =>
		window.__frames.map((f) => {
			const encode = (bytes) => {
				let value = ''
				for (let i = 0; i < bytes.length; i += 16384)
					value += String.fromCharCode(...bytes.subarray(i, i + 16384))
				return btoa(value)
			}
			return { left: encode(f.left), right: encode(f.right) }
		}),
	)
	const frames = encoded.map((f) => ({
		left: Buffer.from(f.left, 'base64'),
		right: Buffer.from(f.right, 'base64'),
	}))
	await mkdir('.temp/slam-phase0/recording', { recursive: true })
	for (let i = 0; i < frames.length; i++)
		for (const eye of ['left', 'right'])
			await writeFile(`.temp/slam-phase0/recording/${i}-${eye}.rgba`, Buffer.from(frames[i][eye]))
	const packed = Buffer.concat(frames.flatMap((f) => [Buffer.from(f.left), Buffer.from(f.right)]))
	const compressed = gzipSync(packed)
	await writeFile('docs/slam-demo/phase0/stereo-fixture.rgba.gz', compressed)
	await writeFile(
		'docs/slam-demo/phase0/fixture.json',
		JSON.stringify(
			{
				version: 1,
				width: 640,
				height: 480,
				channels: 4,
				frameCount: frames.length,
				order: 'frame-major, left then right, top-down RGBA8',
				timestampStepSeconds: 0.1,
				seed: 42,
				sha256: createHash('sha256').update(packed).digest('hex'),
				bytes: packed.length,
				gzipBytes: compressed.length,
				calibration: report.calibration,
				truth: report.truth,
			},
			null,
			2,
		) + '\n',
	)
	console.log(JSON.stringify(report, null, 2))
	if (report.opencv.error) throw Error(report.opencv.error)
	for (const name of ['typescript', 'opencv'])
		for (const r of report[name].results)
			if (
				!Number.isFinite(r.translationErrorM) ||
				!Number.isFinite(r.rotationVectorErrorRad) ||
				r.translationErrorM > 0.01 ||
				r.rotationVectorErrorRad > 0.005
			)
				throw Error(`${name} exceeds fixture tolerance`)
} finally {
	await browser.close()
}
