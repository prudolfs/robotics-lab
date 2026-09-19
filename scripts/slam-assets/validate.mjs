import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
const read = path => readFileSync(new URL('../../'+path, import.meta.url))
const json = path => JSON.parse(read(path))
const manifest = json('assets/slam-demo/manifest.json')
const report = json('docs/slam-demo/phase2/asset-export.json')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
assert.equal(report.manifestHash, sha(read('assets/slam-demo/manifest.json')), 'Stale scene export')
assert.deepEqual(json('apps/slam-demo/public/assets/slam/scene-manifest.json'), manifest)
const sample = json('docs/slam-demo/phase2/sample-export.json')
assert.equal(sample.manifestHash, report.manifestHash)
assert.equal(sha(read('apps/slam-demo/public/assets/slam/workbench.glb')),sample.bundles.workbench.sha256)
const decoder=json('apps/slam-demo/public/assets/slam/draco/provenance.json')
for(const [name,hash] of Object.entries(decoder.files))assert.equal(sha(read('apps/slam-demo/public/assets/slam/draco/'+name)),hash)
const files = {}
for (const [name, bundle] of Object.entries(report.bundles)) {
 const bytes = read(`apps/slam-demo/public/assets/slam/${name}.glb`)
 assert.equal(bytes.toString('utf8',0,4),'glTF')
 assert.equal(bytes.readUInt32LE(4),2)
 assert.equal(sha(bytes), bundle.sha256)
 assert.equal(bytes.length, bundle.bytes)
 const gltf=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)))
 assert(gltf.extensionsRequired.includes('KHR_draco_mesh_compression'))
 for(const mesh of gltf.meshes)for(const p of mesh.primitives)assert('TEXCOORD_0' in p.attributes, 'UVs missing')
 const ids=gltf.nodes.map(n=>n.extras?.asset_id).filter(Boolean)
 assert.equal(ids.length,new Set(ids).size, 'Duplicate asset IDs')
 files[name]=gltf
}
const near = (a,b) => assert(Math.abs(a-b)<1e-5, `${a} != ${b}`)
const position = (gltf,name,canonical) => {
 const node=gltf.nodes.find(n=>n.name===name);assert(node,`${name} missing`)
 assert(!gltf.nodes.some(n=>n.children?.includes(gltf.nodes.indexOf(node))), `${name} must be at scene root`)
 const [x,y,z]=canonical
 ;(node.translation||[0,0,0]).forEach((v,i)=>near(v,[x,z,-y][i]))
 return node
}
for(const [name,coordinates] of Object.entries(manifest.mounts)) {
 const node=position(files.rover,name,coordinates)
 if(name.startsWith('Wheel'))assert(node.children?.length,'Wheel has no articulated geometry')
 else assert.deepEqual(JSON.parse(node.extras.optical_to_robot),manifest.calibration.opticalToRobot)
}
near(manifest.mounts.Camera_Left[1]-manifest.mounts.Camera_Right[1],manifest.calibration.baseline)
near(manifest.mounts.Wheel_Left[1]-manifest.mounts.Wheel_Right[1],manifest.robot.wheelBase)
near(manifest.mounts.Wheel_Left[2],manifest.robot.wheelRadius)
for(const anchor of manifest.anchors)position(files.lab,anchor.id,anchor.position)
for(const obstacle of manifest.obstacles) {
 const node=position(files.lab,'Collision_'+obstacle.id,[obstacle.x,obstacle.y,obstacle.height/2])
 assert.deepEqual(JSON.parse(node.extras.collision_footprint),obstacle)
 const bounds=report.moduleBounds[obstacle.id]
 for(const [i,center,extent] of [[0,obstacle.x,obstacle.width],[1,obstacle.y,obstacle.depth]]) {
  assert(bounds.min[i]>=center-extent/2-.015)
  assert(bounds.max[i]<=center+extent/2+.015)
 }
}
assert(Object.values(report.bundles).reduce((n,b)=>n+b.triangles,0)<500000)
assert(Object.values(report.bundles).reduce((n,b)=>n+b.bytes,0)<25000000)
console.log('Asset contract passed: hashes, Draco, UVs, IDs, mounts, stereo basis, pivots, colliders, anchors, measured module bounds and asset budgets.')
