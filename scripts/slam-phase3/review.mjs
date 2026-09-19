import { chromium } from '../../apps/slam-demo/node_modules/@playwright/test/index.mjs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
const browser=await chromium.launch({channel:'chrome',headless:true})
const errors=[]
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>{errors.push(e.message);process.stderr.write(e.message+'\n')})
 await page.goto('http://127.0.0.1:8082/@fs/'+resolve('scripts/slam-phase3/gpu.html'))
 await page.waitForFunction(()=>window.__stereoGpu)
 const gpu=await page.evaluate(()=>window.__stereoGpu)
 await page.goto('http://127.0.0.1:8082')
 await page.getByTestId('sensor-frame').filter({hasText:'Pair 0'}).waitFor({timeout:30000})
 await page.screenshot({path:'docs/slam-demo/phase3/ready.png',fullPage:true})
 await page.getByRole('button',{name:'Run inspection',exact:true}).click();await page.waitForTimeout(8000)
 await page.getByRole('button',{name:'Pause',exact:true}).click();await page.waitForTimeout(300)
 await page.screenshot({path:'docs/slam-demo/phase3/capturing.png',fullPage:true})
 const sensor=await page.getByRole('region',{name:'Stereo acquisition settings'}).innerText()
 await page.getByRole('button',{name:/Save last/}).scrollIntoViewIfNeeded()
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:/Save last/}).click();const download=await downloadPromise
 await mkdir('.temp/slam-phase3',{recursive:true});await download.saveAs('.temp/slam-phase3/captured.slamframes')
 const bytes=await readFile('.temp/slam-phase3/captured.slamframes');const header=JSON.parse(bytes.toString('utf8',8,8+bytes.readUInt32LE(4)))
 await writeFile('docs/slam-demo/phase3/captured.slamframes.gz',gzipSync(bytes))
 await writeFile('docs/slam-demo/phase3/fixture.json',JSON.stringify({sha256:createHash('sha256').update(bytes).digest('hex'),frames:header.frames.map(f=>({frameId:f.frameId,timestamp:f.timestamp,checksum:f.checksum}))},null,2)+'\n')
 await page.getByLabel('Replay stereo recording').setInputFiles('.temp/slam-phase3/captured.slamframes')
 await page.getByTestId('sensor-status').filter({hasText:'Replay complete'}).waitFor()
 await page.screenshot({path:'docs/slam-demo/phase3/replay.png',fullPage:true})
 await page.getByRole('button',{name:'Return to live sensor'}).click()
 await page.getByLabel('Sensor input mode').selectOption('synthetic');await page.getByLabel('Sensor timing').selectOption('lockstep')
 await page.getByRole('button',{name:'Run inspection',exact:true}).click();await page.waitForTimeout(2000);await page.getByRole('button',{name:'Pause',exact:true}).click()
 await page.screenshot({path:'docs/slam-demo/phase3/synthetic.png',fullPage:true})
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'docs/slam-demo/phase3/mobile.png',fullPage:true})
 await writeFile('docs/slam-demo/phase3/browser-review.json',JSON.stringify({browser:browser.version(),gpu,sensor,errors},null,2)+'\n')
 if(errors.length)throw Error(errors.join('\n'))
}finally{await browser.close()}
