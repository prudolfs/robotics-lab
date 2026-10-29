import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const { buildSync } = createRequire(new URL('../../apps/slam-demo/package.json', import.meta.url))(
	'esbuild',
)
const root = fileURLToPath(new URL('../../', import.meta.url))
const spec = JSON.parse(readFileSync(`${root}docs/slam-demo/phase0/opencv-build.json`))
const bytes = readFileSync(`${root}apps/slam-demo/public/vision/opencv.js`)
if (createHash('sha256').update(bytes).digest('hex') !== spec.sha256)
	throw Error('OpenCV artifact differs from pinned Phase 0 build')
const directory = `${root}apps/slam-demo/public/vision/`
mkdirSync(directory, { recursive: true })
// Concurrent dev/test builds publish complete files atomically; no partial worker may be served.
for (const [source, target] of [
	['processing', 'worker'],
	['optimization', 'optimizer'],
	['graph', 'graph'],
]) {
	const temporary = `${directory}.${target}-${process.pid}.js`
	buildSync({
		entryPoints: [`${root}apps/slam-demo/src/sensor/${source}.worker.ts`],
		bundle: true,
		format: 'iife',
		platform: 'browser',
		target: 'es2022',
		outfile: temporary,
	})
	execFileSync(process.execPath, ['--check', temporary])
	renameSync(temporary, `${directory + target}.js`)
}
writeFileSync(`${directory}provenance.json`, `${JSON.stringify(spec, null, 2)}\n`)
