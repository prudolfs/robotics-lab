import { createRequire } from 'node:module'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import assert from 'node:assert/strict'
import { createOdometry, type Cv } from '../../packages/vision/src/index'
mkdirSync('.temp/slam-mapping',{recursive:true})
copyFileSync('apps/slam-demo/public/vision/opencv.js','.temp/slam-mapping/opencv.cjs')
const cv=createRequire(import.meta.url)(resolve('.temp/slam-mapping/opencv.cjs')) as Cv & { onRuntimeInitialized?:()=>void }
await new Promise<void>(r=>{if(cv.Mat)r();else cv.onRuntimeInitialized=r})
const k={width:640,height:480,fx:480,fy:480,cx:320,cy:240,baseline:.12},size=640*480*4
const bytes=gunzipSync(readFileSync('docs/slam-demo/phase0/stereo-fixture.rgba.gz'))
const tracker=createOdometry(cv,k,{mapping:true}),sequence=[]
for(let i=0;i<5;i++){
 const offset=i*size*2,result=tracker.process(bytes.subarray(offset,offset+size),bytes.subarray(offset+size,offset+size*2),i,i*.7)
 assert(result.map);assert.deepEqual(result.map.pose,result.pose);assert.equal(result.map.frameId,result.frameId);assert.equal(result.nativeObjects,3)
 sequence.push(result)
}
assert.equal(sequence.at(-1)?.status,'tracking')
assert((sequence.at(-1)?.map?.keyframes.length??0)>=2)
assert(sequence.some(r=>(r.map?.mapMatches??0)>=8))
const firstIds=new Set(sequence[0].map?.landmarks.map(p=>p.id)),retained=sequence.at(-1)!.map!.landmarks.filter(p=>firstIds.has(p.id)).length
assert(retained>16)
const blank=new Uint8Array(size),last=sequence.at(-1);let lost
for(let i=5;i<11;i++)lost=tracker.process(blank,blank,i,2.8+(i-4)*.1)
assert.equal(lost?.status,'lost');assert.deepEqual(lost?.pose,last?.pose);assert.deepEqual(lost?.map,last?.map)
tracker.dispose();assert.equal(tracker.nativeObjects(),0)
const fresh=createOdometry(cv,k,{mapping:true}),reset=fresh.process(bytes.subarray(0,size),bytes.subarray(size,size*2),0,0)
assert.equal(reset.map?.revision,1);assert.equal(reset.map?.keyframes[0].id,0);fresh.dispose();assert.equal(fresh.nativeObjects(),0)
writeFileSync('docs/slam-demo/phase5/algorithm-checks.json',JSON.stringify({retainedLandmarkIds:retained,lossFreezesPoseAndMap:true,resetCreatesNewMap:true,nativeObjectsAfterDispose:0,frames:sequence.map(r=>({frameId:r.frameId,status:r.status,pose:r.pose,revision:r.map?.revision,landmarks:r.map?.landmarks.length,keyframes:r.map?.keyframes.length,mapMatches:r.map?.mapMatches,bundle:r.map?.bundle,nativeObjects:r.nativeObjects,peakNativeObjects:r.peakNativeObjects}))},null,2)+'\n')
console.log('Phase 5 real-pixel fixtures passed: persistent IDs, map tracking, coherent revisions, frozen loss, reset and native disposal.')
