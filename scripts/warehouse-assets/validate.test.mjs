import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
	Box3,
	Matrix4,
	Quaternion,
	Vector3,
} from '../../apps/warehouse-demo/node_modules/three/build/three.core.js'

const manifest = JSON.parse(
	readFileSync(new URL('../../assets/warehouse-demo/manifest.json', import.meta.url)),
)
function readBundle(name) {
	const buffer = readFileSync(
		new URL(`../../apps/warehouse-demo/public/assets/warehouse/${name}.glb`, import.meta.url),
	)
	assert.equal(buffer.toString('ascii', 0, 4), 'glTF')
	const json = JSON.parse(buffer.toString('utf8', 20, 20 + buffer.readUInt32LE(12)))
	return { json, bytes: buffer.length }
}
function bounds(json) {
	const result = new Box3()
	const visit = (index, parent) => {
		const node = json.nodes[index]
		const local = node.matrix
			? new Matrix4().fromArray(node.matrix)
			: new Matrix4().compose(
					new Vector3().fromArray(node.translation || [0, 0, 0]),
					new Quaternion().fromArray(node.rotation || [0, 0, 0, 1]),
					new Vector3().fromArray(node.scale || [1, 1, 1]),
				)
		const world = parent.clone().multiply(local)
		if (node.mesh !== undefined)
			for (const primitive of json.meshes[node.mesh].primitives) {
				const position = json.accessors[primitive.attributes.POSITION]
				result.union(
					new Box3(
						new Vector3().fromArray(position.min),
						new Vector3().fromArray(position.max),
					).applyMatrix4(world),
				)
			}
		for (const child of node.children || []) visit(child, world)
	}
	for (const index of json.scenes[json.scene || 0].nodes) visit(index, new Matrix4())
	return result
}
for (const name of ['environment', 'forklift', 'pallet-a', 'pallet-b']) {
	test(`${name} GLB contains only the warehouse scene and embedded resources`, () => {
		const { json, bytes } = readBundle(name)
		assert.equal(json.scenes.length, 1, 'Unrelated Blender scenes must not be exported')
		assert.equal(json.scenes[0].name, 'Warehouse_Phase3')
		assert.ok(bytes < 1_500_000)
		for (const image of json.images || []) assert.equal(image.uri, undefined)
		assert.ok(json.nodes.every((node) => node.name !== 'Cube'))
		const box = bounds(json)
		if (name.startsWith('pallet')) {
			assert.ok(
				box.min.x >= -0.551 && box.max.x <= 0.551,
				`Pallet X envelope ${box.min.x}..${box.max.x}`,
			)
			assert.ok(
				box.min.z >= -0.551 && box.max.z <= 0.551,
				`Pallet Z envelope ${box.min.z}..${box.max.z}`,
			)
			assert.ok(box.min.y >= -0.001 && box.max.y < 1)
		}
		if (name === 'forklift') {
			assert.ok(box.min.x >= -0.92 && box.max.x <= manifest.forklift.loadForward + 0.55)
			assert.ok(
				box.min.z >= -0.51 && box.max.z <= 0.51,
				`Forklift width envelope ${box.min.z}..${box.max.z}`,
			)
			assert.ok(box.min.y >= -0.001)
		}
	})
}
test('forklift export retains all articulation pivots and starts at the origin', () => {
	const { json } = readBundle('forklift')
	const names = new Set(json.nodes.map((node) => node.name))
	for (const name of [
		manifest.pivots.mast,
		manifest.pivots.fork,
		...manifest.pivots.frontWheels,
		...manifest.pivots.rearWheels,
		...manifest.pivots.steering,
	])
		assert.ok(names.has(name), `Missing ${name}`)
	const root = json.nodes.find((node) => node.name === 'Forklift_Root')
	assert.deepEqual(root.translation || [0, 0, 0], [0, 0, 0])
	const fork = json.nodes.find((node) => node.name === manifest.pivots.fork)
	assert.ok(Math.abs(fork.translation[1] - manifest.forklift.pickupHeight) < 1e-6)
})
