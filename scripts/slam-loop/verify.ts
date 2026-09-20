import {createRequire} from 'node:module'
import {copyFileSync,mkdirSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import assert from 'node:assert/strict'
import {cameraPoint,identity,incrementPose,project,verifyRevisit,solveMotion,NativeScope,type Cv,type StereoSample,type V3} from '../../packages/vision/src/index'
mkdirSync('.temp/slam-loop',{recursive:true});copyFileSync('apps/slam-demo/public/vision/opencv.js','.temp/slam-loop/opencv.cjs')
const cv=createRequire(import.meta.url)(resolve('.temp/slam-loop/opencv.cjs')) as Cv&{onRuntimeInitialized?:()=>void}
await new Promise<void>(r=>{if(cv.Mat)r();else cv.onRuntimeInitialized=r})
const k={width:640,height:480,fx:480,fy:480,cx:320,cy:240,baseline:.12},ledger={live:0,peak:0}
const solve=(points:V3[],pixels:[number,number][])=>{const scope=new NativeScope(ledger);try{return solveMotion(cv,points,pixels,k,73,scope)}finally{scope.dispose()}}
const a:StereoSample[]=Array.from({length:36},(_,i)=>{const point:V3=[(i%6-2.5)*.3,(Math.floor(i/6)-2.5)*.25,2+(i%4)*.3];return {point,pixel:project(point,k)!,descriptor:Array.from({length:49},(_,j)=>j===i?1:0)}})
const expected=incrementPose(identity(),[.12,-.02,.04,0,.03,.01]),b=a.map(s=>{const point=cameraPoint(expected,s.point);return {...s,point,pixel:project(point,k)!}})
const good=verifyRevisit(a,b,k,solve);assert(good.measurement);assert(Math.hypot(...good.measurement.position.map((v,i)=>v-expected.position[i]))<.001)
const bad=b.map((s,i)=>({...s,point:b[(i*5+7)%36].point,pixel:b[(i*5+7)%36].pixel})),rejected=verifyRevisit(a,bad,k,solve);assert.equal(rejected.measurement,null)
const plane=a.map(s=>{const point:V3=[s.point[0],s.point[1],3];return {...s,point,pixel:project(point,k)!}}),degenerate=verifyRevisit(plane,plane,k,solve);assert.equal(degenerate.measurement,null);assert.equal(ledger.live,0)
writeFileSync('docs/slam-demo/phase6/geometry-checks.json',JSON.stringify({trueRevisit:good,appearanceLookalike:rejected,planarAmbiguity:degenerate,nativeObjectsAfterDispose:ledger.live,peak:ledger.peak},null,2)+'\n')
console.log('Native revisit verification passed: true metric transform, false appearance candidate, planar ambiguity, native disposal.')
