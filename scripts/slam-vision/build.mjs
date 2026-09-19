import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const root=fileURLToPath(new URL('../../',import.meta.url))
const spec=JSON.parse(readFileSync(root+'docs/slam-demo/phase0/opencv-build.json'))
const bytes=readFileSync(root+'apps/slam-demo/public/vision/opencv.js')
if(createHash('sha256').update(bytes).digest('hex')!==spec.sha256)throw Error('OpenCV artifact differs from pinned Phase 0 build')
mkdirSync(root+'apps/slam-demo/public/vision',{recursive:true})
execFileSync(root+'node_modules/.bin/esbuild',[root+'apps/slam-demo/src/sensor/processing.worker.ts','--bundle','--format=iife','--platform=browser','--target=es2022','--outfile='+root+'apps/slam-demo/public/vision/worker.js'],{stdio:'inherit'})
execFileSync(root+'node_modules/.bin/esbuild',[root+'apps/slam-demo/src/sensor/optimization.worker.ts','--bundle','--format=iife','--platform=browser','--target=es2022','--outfile='+root+'apps/slam-demo/public/vision/optimizer.js'],{stdio:'inherit'})
writeFileSync(root+'apps/slam-demo/public/vision/provenance.json',JSON.stringify(spec,null,2)+'\n')
