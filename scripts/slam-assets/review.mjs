import {chromium} from '../../apps/slam-demo/node_modules/@playwright/test/index.mjs'
import {resolve} from 'node:path'
import {writeFile} from 'node:fs/promises'
const browser=await chromium.launch({channel:'chrome',headless:true})
try{const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>process.stderr.write(String(e)+'\n'));await page.goto('http://127.0.0.1:8082/@fs/'+resolve('scripts/slam-assets/review.html'));await page.waitForFunction(()=>window.__benchReady);await page.screenshot({path:'docs/slam-demo/phase2/workbench-gate.png'});await writeFile('docs/slam-demo/phase2/workbench-gate.json',JSON.stringify(await page.evaluate(()=>window.__benchReady),null,2)+'\n')}finally{await browser.close()}
