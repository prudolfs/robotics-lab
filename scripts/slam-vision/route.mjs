import {chromium} from '../../apps/slam-demo/node_modules/@playwright/test/index.mjs'
import {resolve} from 'node:path'
import {writeFile} from 'node:fs/promises'
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
 const page=await browser.newPage({viewport:{width:1000,height:800}});page.on('pageerror',e=>process.stderr.write(e.message+'\n'))
 await page.goto('http://127.0.0.1:8082/@fs/'+resolve('scripts/slam-vision/route.html'))
 await page.waitForFunction(()=>window.__routeReview||window.__routeError,{},{timeout:180000})
 const report=await page.evaluate(()=>window.__routeReview??{error:window.__routeError})
 await writeFile('docs/slam-demo/phase4/route.json',JSON.stringify({browser:browser.version(),...report},null,2)+'\n')
 const counts={};for(const f of report.measurements??[])counts[f.status]=(counts[f.status]??0)+1
 process.stdout.write(JSON.stringify({counts,wallMs:report.wallMs,rms:report.evaluation?.rms,error:report.error})+'\n')
}finally{await browser.close()}
