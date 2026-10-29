import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { Box3, Vector3 } from '../../apps/greenhouse-demo/node_modules/three/build/three.module.js'
import { GLTFLoader } from '../../apps/greenhouse-demo/node_modules/three/examples/jsm/loaders/GLTFLoader.js'

const source = new URL('../../assets/greenhouse-demo/', import.meta.url)
const output = new URL('../../apps/greenhouse-demo/public/assets/greenhouse/', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('manifest.json', source)))
assert.deepEqual(JSON.parse(await readFile(new URL('manifest.json', output))), manifest)
const names = ['environment', 'caretaker', 'capsule', 'plant-a', 'plant-b', 'plant-c']
const report = { bundles: {}, totalBytes: 0, totalTriangles: 0 }
const loader = new GLTFLoader()
const assets = {}
for (const name of names) {
	const data = await readFile(new URL(`${name}.glb`, output))
	assert.equal(data.toString('ascii', 0, 4), 'glTF')
	const jsonLength = data.readUInt32LE(12)
	const json = JSON.parse(data.toString('utf8', 20, 20 + jsonLength))
	assert.equal(json.scenes.length, 1)
	assert.ok(!json.images?.length, 'kit uses embedded PBR colors; no external texture requests')
	assert.ok(
		json.buffers.every((buffer) => !buffer.uri),
		'all buffers embedded',
	)
	assert.ok(!json.cameras?.length)
	const asset = await loader.parseAsync(
		data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
		'',
	)
	assets[name] = asset.scene
	asset.scene.updateMatrixWorld(true)
	let triangles = 0
	let meshes = 0
	asset.scene.traverse((node) => {
		assert.ok(!['Cube', 'Camera', 'Light'].includes(node.name), 'unrelated default scene excluded')
		if (!node.isMesh) return
		meshes++
		triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3
	})
	report.bundles[name] = { bytes: data.length, meshes, triangles }
	report.totalBytes += data.length
	report.totalTriangles += triangles
}
assert.ok(report.totalBytes <= manifest.limits.totalBytes)
assert.ok(report.totalTriangles <= manifest.limits.totalTriangles)
const robot = assets.caretaker
for (const name of Object.values(manifest.pivots).flat())
	assert.ok(robot.getObjectByName(name), `missing ${name}`)
const approximately = (actual, expected, epsilon = 0.00001) =>
	assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`)
const coordinate = ([x, y, z]) => [x, z, -y]
for (const [index, name] of ['Wheel_Left', 'Wheel_Right'].entries()) {
	const wheel = robot.getObjectByName(name)
	wheel.position.toArray().forEach((value, axis) => {
		approximately(value, coordinate(manifest.robot.wheelCenters[index])[axis])
	})
	const bounds = new Box3().setFromObject(wheel)
	approximately(bounds.max.y - bounds.min.y, 2 * manifest.robot.wheelRadius, 0.008)
	approximately(bounds.max.x - bounds.min.x, 2 * manifest.robot.wheelRadius, 0.008)
	approximately(bounds.max.z - bounds.min.z, manifest.robot.wheelWidth, 0.005)
}
approximately(robot.getObjectByName('Lift_Carriage').position.y, manifest.robot.liftMin)
assert.equal(robot.getObjectByName('Robot_Eye').parent.name, 'Head_Pitch')
const capsule = new Box3().setFromObject(assets.capsule)
const center = capsule.getCenter(new Vector3())
for (const value of center.toArray()) approximately(value, 0, 0.002)
for (const value of capsule.getSize(new Vector3()).toArray())
	assert.ok(value <= manifest.capsule.radius * 2 + 0.001)
for (const name of names.filter((name) => name.startsWith('plant-'))) {
	const pot = new Box3()
	assets[name].traverse((node) => {
		if (node.isMesh && node.material.name.startsWith('GH_clay'))
			pot.union(new Box3().setFromObject(node))
	})
	approximately(pot.min.y, 0, 0.001)
	assert.ok(pot.max.y <= manifest.pot.height)
	assert.ok(
		Math.max(Math.abs(pot.min.x), Math.abs(pot.max.x), Math.abs(pot.min.z), Math.abs(pot.max.z)) <=
			manifest.pot.radius + 0.001,
	)
}
assert.ok((await readFile(new URL('greenhouse.blend', source))).length > 100000)
await writeFile(
	new URL('../../docs/greenhouse-demo/phase3/asset-validation.json', import.meta.url),
	`${JSON.stringify(report, null, 2)}\n`,
)
process.stdout.write(
	`Validated six GLBs, all articulation pivots, wheel/pot/capsule bounds and embedded resources: ${report.totalBytes} bytes, ${report.totalTriangles} triangles.\n`,
)
