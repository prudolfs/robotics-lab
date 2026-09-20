import {chromium} from '../../apps/slam-demo/node_modules/@playwright/test/index.mjs'
import {writeFile} from 'node:fs/promises'
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[]
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}})
 page.on('pageerror',e=>errors.push(e.message));await page.routeWebSocket('**/*',()=>{})
 await page.goto('http://127.0.0.1:8082')
 await page.getByLabel('Sensor timing').selectOption('lockstep')
 await page.getByTestId('vo-status').filter({hasText:'initializing'}).waitFor()
 await page.getByRole('button',{name:'Run inspection',exact:true}).click()
 await page.waitForFunction(()=>Number(document.querySelector('[data-testid="loop-corrections"]')?.textContent)>0,{},{timeout:240000})
 const pause=page.getByRole('button',{name:'Pause',exact:true});if(await pause.count())await pause.click()
 await page.waitForTimeout(800)
 const inspector=page.getByRole('region',{name:'Loop closure results'});await inspector.scrollIntoViewIfNeeded()
 await page.screenshot({path:'docs/slam-demo/phase6/closure.png',fullPage:true})
 const text=await inspector.innerText();await inspector.screenshot({path:'docs/slam-demo/phase6/events.png'})
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'docs/slam-demo/phase6/mobile.png',fullPage:true})
 await writeFile('docs/slam-demo/phase6/browser-review.json',JSON.stringify({browser:browser.version(),inspector:text,errors},null,2)+'\n')
 if(errors.length)throw Error(errors.join('\n'))
}finally{await browser.close()}
