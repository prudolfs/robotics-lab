import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const spec = JSON.parse(await readFile('docs/slam-demo/phase0/opencv-build.json', 'utf8'))
const response = await fetch(spec.url)
if (!response.ok) throw Error(`Download failed: ${response.status}`)
const bytes = Buffer.from(await response.arrayBuffer())
if (createHash('sha256').update(bytes).digest('hex') !== spec.sha256)
	throw Error('OpenCV checksum differs: review upstream before updating the pinned hash')
await mkdir('.temp/slam-phase0/vendor', { recursive: true })
await writeFile('.temp/slam-phase0/vendor/opencv.js', bytes)
console.log(`Verified OpenCV.js: ${bytes.length} bytes`)
