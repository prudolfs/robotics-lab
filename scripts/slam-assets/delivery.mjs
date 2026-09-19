import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
const root='apps/slam-demo/dist'
const files=[]
function walk(dir) {
 for(const name of readdirSync(dir)) {
  const path=dir+'/'+name
  if(statSync(path).isDirectory()) walk(path)
  else { const bytes=readFileSync(path); files.push({file:path.slice(root.length+1),bytes:bytes.length,gzipBytes:gzipSync(bytes).length}) }
 }
}
walk(root)
writeFileSync('docs/slam-demo/phase2/delivery.json',JSON.stringify({
 note:'Entire production directory including optional workbench and licenses; gzip estimates depend on server configuration.',
 totalBytes:files.reduce((sum,file)=>sum+file.bytes,0),
 totalGzipBytes:files.reduce((sum,file)=>sum+file.gzipBytes,0),files,
},null,2)+'\n')
