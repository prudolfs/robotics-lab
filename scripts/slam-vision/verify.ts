import {createRequire} from 'node:module'
import {copyFileSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {gunzipSync} from 'node:zlib'
import assert from 'node:assert/strict'
import {createOdometry,solveMotion,NativeScope,integrate,identity,triangulate,rotate,project,type Cv,type V3,type Pixel} from '../../packages/vision/src/index'
const k={width:640,height:480,fx:480,fy:480,cx:320,cy:240,baseline:.12}
mkdirSync('.temp/slam-vision',{recursive:true});copyFileSync('apps/slam-demo/public/vision/opencv.js','.temp/slam-vision/opencv.cjs')
const cv=createRequire(import.meta.url)(resolve('.temp/slam-vision/opencv.cjs')) as Cv&{onRuntimeInitialized?:()=>void}
await new Promise<void>(r=>{if(cv.Mat)r();else cv.onRuntimeInitialized=r})
const checks:Record<string,unknown>={}
const points:V3[]=Array.from({length:80},(_,i)=>[((i%10)-4.5)*.17,(Math.floor(i/10)-3.5)*.13,2+(i%7)*.21])
for(const [name,angle,t,outliers] of [['known motion',.04,[-.03,.01,-.06],0],['outliers',.04,[-.03,.01,-.06],20],['pure rotation',.09,[0,0,0],0]] as [string,number,V3,number][]){
 const r=[Math.cos(angle),0,Math.sin(angle),0,1,0,-Math.sin(angle),0,Math.cos(angle)]
 const uv=points.map((p,i)=>{const rotated=rotate(r,p),q=project(rotated.map((v,j)=>v+t[j]) as V3,k) as Pixel;return i<outliers?[30+i*11,80+i*9] as Pixel:q})
 const ledger={live:0,peak:0},scope=new NativeScope(ledger)
 const motion=solveMotion(cv,points,uv,k,42,scope);assert(motion)
 const translationError=Math.hypot(...motion.t.map((v,i)=>v-t[i]));assert(translationError<.003,name)
 assert(motion.inliers.length>=points.length-outliers-1)
 const composed=integrate(identity(),motion.r,motion.t);assert(Math.hypot(...composed.position)<.2)
 scope.dispose();assert.equal(ledger.live,0)
 checks[name]={translationError,inliers:motion.inliers.length,rmse:motion.rmse,nativeObjectsAfterDispose:ledger.live}
}
assert.equal(triangulate([320,240],[319,240],k),null);assert.equal(triangulate([320,240],[324,240],k),null);assert.equal(triangulate([320,240],[310,244],k),null)
checks['invalid stereo']='low/negative disparity and epipolar mismatch rejected'
const blank=new Uint8Array(640*480*4);for(let i=3;i<blank.length;i+=4)blank[i]=255
const empty=createOdometry(cv,k);let result
for(let i=0;i<6;i++)result=empty.process(blank,blank,i,i/10)
assert.equal(result?.status,'lost');assert.equal(result?.pose,null);empty.dispose();assert.equal(empty.nativeObjects(),0)
checks['blank/insufficient']='lost without any fabricated pose; native objects released'
const bytes=gunzipSync(readFileSync('docs/slam-demo/phase0/stereo-fixture.rgba.gz')),imageSize=640*480*4
const tracker=createOdometry(cv,k),sequence=[]
for(let i=0;i<5;i++){const start=i*imageSize*2;sequence.push(tracker.process(bytes.subarray(start,start+imageSize),bytes.subarray(start+imageSize,start+2*imageSize),i,i/10))}
assert.equal(sequence[4].status,'tracking',JSON.stringify(sequence.map(s=>({status:s.status,reason:s.reason,stereo:s.stereo,matches:s.matches}))))
assert(sequence[4].pose&&Math.hypot(...sequence[4].pose.position)>.03)
for(let i=0;i<5;i++){const p=sequence[i].pose?.position;assert(p);assert(Math.hypot(p[0]-.012*i,p[1],p[2]-.02*i)<.01,'Rendered fixture metric pose error')}
const acceptedPose=sequence[4].pose
for(let i=5;i<11;i++)result=tracker.process(blank,blank,i,i/10)
assert.equal(result?.status,'lost');assert.deepEqual(result?.pose,acceptedPose);assert.equal(result?.acceptedFrameId,4)
checks['loss freezes last estimate']='No truth substitution or fabricated recovery'
const low=createOdometry(cv,k),first=bytes.subarray(0,imageSize)
for(let i=0;i<6;i++)result=low.process(first,first,i,i/10)
assert.equal(result?.status,'lost');assert.equal(result?.pose,null);low.dispose()
checks['zero-disparity images']='Textured identical eyes rejected; no metric depth/pose'
const sparse=blank.slice();for(let y=200;y<210;y++)for(let x=300;x<310;x++){const i=(y*640+x)*4;sparse[i]=255;sparse[i+1]=255;sparse[i+2]=255}
const insufficient=createOdometry(cv,k);for(let i=0;i<6;i++)result=insufficient.process(sparse,sparse,i,i/10)
assert.equal(result?.status,'lost');assert.equal(result?.pose,null);insufficient.dispose()
checks['insufficient image features']='Single-corner-patch fixture cannot initialize'
assert(sequence.every(s=>s.nativeObjects===3&&s.peakNativeObjects<40))
checks['fixed rendered images']=sequence.map(s=>({frameId:s.frameId,status:s.status,pose:s.pose,stereo:s.stereo,inliers:s.inliers,rmse:s.rmse,nativeObjects:s.nativeObjects,peakNativeObjects:s.peakNativeObjects}))
tracker.dispose();assert.equal(tracker.nativeObjects(),0)
writeFileSync('docs/slam-demo/phase4/algorithm-checks.json',JSON.stringify(checks,null,2)+'\n')
console.log('Phase 4 fixed algorithm checks passed: known motion, outliers, pure rotation, invalid stereo, blank frames and real rendered pixels.')
