import { readFileSync, writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { processFrame } from '../../packages/sensors/src/stereo'
import { decodeRecording } from '../../apps/slam-demo/src/sensor/recording'
const bytes=gunzipSync(readFileSync('docs/slam-demo/phase3/captured.slamframes.gz'))
const fixture=JSON.parse(readFileSync('docs/slam-demo/phase3/fixture.json','utf8'))
assert.equal(createHash('sha256').update(bytes).digest('hex'),fixture.sha256)
const frames=decodeRecording(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength))
const result=frames.map(frame=>{const processed=processFrame(frame);return {frameId:processed.frameId,timestamp:processed.timestamp,checksum:processed.checksum}})
assert.deepEqual(result,fixture.frames)
writeFileSync('docs/slam-demo/phase3/replay.json',JSON.stringify({pairs:result.length,exact:true,frames:result},null,2)+'\n')
console.log(`Replayed ${result.length} recorded pairs exactly in Node; no browser, WebGL, Blender, pose or world data.`)
