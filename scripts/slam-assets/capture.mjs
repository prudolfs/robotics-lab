import { chromium } from '../../apps/slam-demo/node_modules/@playwright/test/index.mjs'
import { writeFile } from 'node:fs/promises'
import { cpus, platform, release } from 'node:os'
const screenshotsOnly=process.argv.includes('--screenshots-only')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const report = { capturedAt: new Date().toISOString(), hardware: cpus()[0].model, os: `${platform()} ${release()}`, browser: browser.version(), viewport: {width:1440,height:900}, views: {}, errors: [] }
try {
 const page = await browser.newPage({ viewport: report.viewport })
 page.on('pageerror', e => report.errors.push(e.message))
 const initStart=Date.now()
 await page.goto(process.env.SLAM_URL || 'http://127.0.0.1:8082')
 await page.getByRole('button',{name:'Run inspection',exact:true}).waitFor()
 await page.waitForFunction(()=>!document.querySelector('.asset-loading'))
 report.initialLoadMs=Date.now()-initStart
 for (const [name, button] of [['overview','Overview'],['workbench','Workbench'],['robot-eye','Robot eye'],['follow','Follow robot']]) {
  await page.getByRole('button',{name:button,exact:true}).click()
  await page.waitForTimeout(screenshotsOnly?1500:10500)
  const sample = await page.evaluate(()=>window.__slamRenderMetrics)
  const times=sample.frameMs.slice(60).sort((a,b)=>a-b)
  report.views[name]={...sample,frameMs:undefined,samples:times.length,p50Ms:times[Math.floor(times.length*.5)],p95Ms:times[Math.floor(times.length*.95)]}
  await page.screenshot({path:`docs/slam-demo/phase2/${name}.png`,fullPage:true})
 }
 await page.getByRole('button',{name:'Overview',exact:true}).click()
 await page.getByLabel('Graphics quality').selectOption('low')
 await page.waitForTimeout(screenshotsOnly?1500:10500)
 const low=await page.evaluate(()=>window.__slamRenderMetrics)
 const sorted=low.frameMs.slice(60).sort((a,b)=>a-b)
 report.views.low={...low,frameMs:undefined,samples:sorted.length,p50Ms:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)]}
 await page.screenshot({path:'docs/slam-demo/phase2/low.png',fullPage:true})
 await page.getByLabel('Graphics quality').selectOption('standard')
 await page.getByRole('button',{name:'Run inspection',exact:true}).click()
 await page.waitForTimeout(screenshotsOnly?1500:65000)
 const moving=await page.evaluate(()=>window.__slamRenderMetrics)
 const frames=moving.frameMs.slice(60).sort((a,b)=>a-b)
 report.views.running={...moving,frameMs:undefined,samples:frames.length,p50Ms:frames[Math.floor(frames.length*.5)],p95Ms:frames[Math.floor(frames.length*.95)],framesOver25Ms:frames.filter(t=>t>25).length}
 await page.getByRole('button',{name:'Pause',exact:true}).click()
 await page.screenshot({path:'docs/slam-demo/phase2/running.png',fullPage:true})
 await page.getByRole('button',{name:'Reset simulation'}).click()
 report.resources=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>({name:new URL(r.name).pathname,bytes:r.encodedBodySize})))
 await page.setViewportSize({width:390,height:844})
 await page.waitForTimeout(1500)
 await page.screenshot({path:'docs/slam-demo/phase2/mobile.png',fullPage:true})
 report.gpu=await page.evaluate(()=>{const gl=document.querySelector('canvas').getContext('webgl2');const ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)})
 if(!screenshotsOnly) await writeFile('docs/slam-demo/phase2/browser-review.json',JSON.stringify(report,null,2)+'\n')
 if(report.errors.length)throw Error(report.errors.join('\n'))
} finally { await browser.close() }
