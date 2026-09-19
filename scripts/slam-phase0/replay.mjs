import { readFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { runTypeScript } from '../../.temp/slam-phase0/frontend.mjs'
const meta = JSON.parse(await readFile('docs/slam-demo/phase0/fixture.json', 'utf8'))
const bytes = gunzipSync(await readFile('docs/slam-demo/phase0/stereo-fixture.rgba.gz'))
assert.equal(createHash('sha256').update(bytes).digest('hex'), meta.sha256)
const size = meta.width * meta.height * 4,
	frames = Array.from({ length: meta.frameCount }, (_, i) => ({
		left: new Uint8Array(bytes.subarray(i * size * 2, (i * 2 + 1) * size)),
		right: new Uint8Array(bytes.subarray((i * 2 + 1) * size, (i * 2 + 2) * size)),
	}))
const one = runTypeScript(frames),
	two = runTypeScript(frames)
assert.deepEqual(
	one.results.map((r) => r.pose),
	two.results.map((r) => r.pose),
)
for (let i = 0; i < one.results.length; i++) {
	const r = one.results[i],
		truth = meta.truth[i].pose
	const translation = Math.hypot(...r.pose.slice(3).map((v, j) => v - truth[j + 3]))
	const rotation = Math.hypot(...r.pose.slice(0, 3).map((v, j) => v - truth[j]))
	assert(translation < 0.01)
	assert(rotation < 0.005)
	assert(r.rms < 1)
	console.log(
		`Frame ${i + 1}: ${(translation * 1000).toFixed(2)} mm, ${rotation.toFixed(6)} rad, ${r.rms.toFixed(3)} px RMS`,
	)
}
console.log('Recorded pixel replay is deterministic; all numerical gates passed.')
