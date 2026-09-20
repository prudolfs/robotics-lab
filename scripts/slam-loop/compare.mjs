import {chromium} from '../../apps/slam-demo/node_modules/@playwright/test/index.mjs'
import {resolve} from 'node:path'
import {writeFile} from 'node:fs/promises'
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
 const page=await browser.newPage({viewport:{width:1000,height:800}})
 page.on('pageerror',e=>process.stderr.write(e.message+'\n'))
 page.on('console',m=>{if(/^(PROGRESS|APPLIED|RESULT)/.test(m.text()))process.stdout.write(m.text()+'\n')})
 await page.routeWebSocket('**/*',()=>{})
 await page.goto('http://127.0.0.1:8082/@fs/'+resolve('scripts/slam-loop/compare.html')+(process.env.LOOP_SEED?`?seed=${process.env.LOOP_SEED}&noise=${process.env.LOOP_NOISE??0}`:''))
 await page.waitForFunction(()=>window.__comparison||window.__comparisonError,{},{timeout:900000})
 const result=await page.evaluate(()=>({reports:window.__comparison??window.__comparisonProgress,error:window.__comparisonError}))
 const name=process.env.LOOP_SEED?`comparison-${process.env.LOOP_SEED}`:'comparison'
 await writeFile(`docs/slam-demo/phase6/${name}.json`,JSON.stringify({browser:browser.version(),...result},null,2)+'\n')
 if(result.error)throw Error(result.error)
 for(const r of result.reports){
  if(!r.corrections||!Number.isFinite(r.on.rms)||!Number.isFinite(r.off.rms)||r.on.rms>=r.off.rms)throw Error(`No closure improvement for seed ${r.seed}: ${r.off.rms} → ${r.on.rms}`)
  if(r.prefixNoLoop?.corrections!==0||!r.prefixNoLoop?.identicalPoses)throw Error(`No-loop prefix changed for seed ${r.seed}`)
  if(r.off.errors.length!==r.frames||r.on.errors.length!==r.frames||r.checksums.length!==r.frames)throw Error(`Incomplete paired trajectory for seed ${r.seed}`)
 }
}finally{await browser.close()}
