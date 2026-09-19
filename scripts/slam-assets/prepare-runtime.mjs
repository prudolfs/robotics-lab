import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
const root=new URL('../../',import.meta.url)
const three=new URL('apps/slam-demo/node_modules/three/',root)
const output=new URL('apps/slam-demo/public/assets/slam/draco/',root)
const version=JSON.parse(readFileSync(new URL('package.json',three))).version
const records={source:`three@${version}/examples/jsm/libs/draco/gltf`,files:{}}
for(const name of ['draco_decoder.wasm','draco_wasm_wrapper.js']) {
 copyFileSync(new URL('examples/jsm/libs/draco/gltf/'+name,three),new URL(name,output))
 records.files[name]=createHash('sha256').update(readFileSync(new URL(name,output))).digest('hex')
}
copyFileSync(new URL('LICENSE',three),new URL('THREE-LICENSE',output))
writeFileSync(new URL('provenance.json',output),JSON.stringify(records,null,2)+'\n')
