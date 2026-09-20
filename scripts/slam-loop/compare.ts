import { WebGLRenderer, PMREMGenerator } from '../../apps/slam-demo/node_modules/three/build/three.module.js'
import { GLTFLoader } from '../../apps/slam-demo/node_modules/three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from '../../apps/slam-demo/node_modules/three/examples/jsm/loaders/DRACOLoader.js'
import { RoomEnvironment } from '../../apps/slam-demo/node_modules/three/examples/jsm/environments/RoomEnvironment.js'
import { createCapture } from '../../apps/slam-demo/src/sensor/capture'
import { createSimulation,setStatus,stepSimulation } from '../../apps/slam-demo/src/sim/simulation'
import { cameraCenter, pixelNoise,frameSeed,type CameraPose,type Vec3,type StereoFrame } from '../../packages/sensors/src/index'
import { multiply,rotate,transpose,type Pose3 } from '../../packages/vision/src/index'
import type { VisionFrame } from '../../apps/slam-demo/src/sensor/visual'
import manifest from '../../assets/slam-demo/manifest.json'
const renderer=new WebGLRenderer();renderer.setSize(640,480);document.body.append(renderer.domElement)
const loader=new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath('/assets/slam/draco/'))
const models=await Promise.all(['lab','cutaway','rover'].map(n=>loader.loadAsync(`/assets/slam/${n}.glb`)))
const room=new RoomEnvironment(),pmrem=new PMREMGenerator(renderer),environment=pmrem.fromScene(room,.04)
const capture=createCapture(renderer,models.map(m=>m.scene),manifest.calibration,[manifest.mounts.Camera_Left,manifest.mounts.Camera_Right] as [Vec3,Vec3],environment.texture)
const process=(worker:Worker,frame:StereoFrame,loopClosure:boolean)=>new Promise<VisionFrame>((resolve,reject)=>{worker.onmessage=({data})=>data.error?reject(Error(data.error)):resolve(data);worker.onerror=e=>reject(Error(e.message));worker.postMessage({...frame,vision:{loopClosure,synchronous:true}},[frame.left,frame.right])})
function aligned(pose:Pose3,initial:CameraPose):Vec3 {const optical=[0,0,1,-1,0,0,0,-1,0],c=Math.cos(initial.heading),s=Math.sin(initial.heading),originRotation=multiply([c,-s,0,s,c,0,0,0,1],optical),origin=cameraCenter(initial,manifest.mounts.Camera_Left as Vec3),offset=rotate(originRotation,pose.position),rotation=multiply(multiply(originRotation,pose.rotation),transpose(optical)),mount=rotate(rotation,manifest.mounts.Camera_Left as Vec3);return origin.map((v,i)=>v+offset[i]-mount[i]) as Vec3}
const query=new URLSearchParams(location.search),fixtures=query.has('seed')?[[Number(query.get('seed')),Number(query.get('noise')??0)]]:[[42,0],[7,4],[99,8]],reports=[]
try {for(const [seed,noise] of fixtures){
 const workers=[new Worker('/vision/worker.js'),new Worker('/vision/worker.js')],truth:{frameId:number;pose:CameraPose}[]=[],checksums:string[]=[],events:unknown[]=[],streamed:unknown[]=[];let simulation=setStatus(createSimulation({noise:false,seed}),'running'),last=-1,lastEvent=-1,final:VisionFrame[]=[],firstApplied:number|null=null,prefixNoLoop:unknown=null
 const initial={...simulation.truth.pose},start=performance.now()
 try {while(simulation.status==='running'){
 if(simulation.tick%6===0&&simulation.tick!==last){last=simulation.tick;const frameId=last/6,left=new ArrayBuffer(640*480*4),right=left.slice(0)
 capture.capture(simulation.truth.pose,simulation.wheelAngles,left,right);pixelNoise(new Uint8Array(left),noise,frameSeed(seed,frameId,0));pixelNoise(new Uint8Array(right),noise,frameSeed(seed,frameId,1))
 const frame={generation:0,frameId,timestamp:frameId/10,calibration:manifest.calibration,kind:'rendered' as const,left,right}
 const other={...frame,left:left.slice(0),right:right.slice(0)}
 final=await Promise.all([process(workers[0],frame,false),process(workers[1],other,true)])
 if(final[0].checksum!==final[1].checksum)throw Error('Comparison pixels differ')
 if(final.some(r=>r.vo?.status==='lost'))throw Error(`Fixture ${seed}: tracking lost at ${frameId}`)
 truth.push({frameId,pose:{...simulation.truth.pose}});checksums.push(final[0].checksum)
 for(const e of final[1].vo?.map?.loop.events??[])if(e.id>lastEvent){events.push(e);lastEvent=e.id;if(e.kind==='applied'){firstApplied??=frameId;console.log('APPLIED '+JSON.stringify({seed,...e}))}}
 if(frameId===400)prefixNoLoop={frames:401,corrections:final[1].vo?.map?.loop.corrections,identicalPoses:JSON.stringify(final[0].vo?.map?.loop.trajectory)===JSON.stringify(final[1].vo?.map?.loop.trajectory)}
 streamed.push({frameId,off:final[0].vo?.pose,on:final[1].vo?.pose})
 document.getElementById('status')!.textContent=`Seed ${seed} ±${noise} · ${frameId}/757 · corrections ${final[1].vo?.map?.loop.corrections??0}`
 if(frameId%100===0)console.log(`PROGRESS seed=${seed} frame=${frameId}`)
 }
 simulation=stepSimulation(simulation)
 }
 const evaluate=(result:VisionFrame)=>{const sequence=result.vo?.map?.loop.trajectory??[],errors=sequence.map(f=>{const actual=truth.find(t=>t.frameId===f.frameId);if(!actual)throw Error('Missing common truth frame');const p=aligned(f.pose,initial);return {frameId:f.frameId,position:p,error:Math.hypot(p[0]-actual.pose.x,p[1]-actual.pose.y,p[2])}});return {rms:Math.sqrt(errors.reduce((s,e)=>s+e.error**2,0)/errors.length),final:errors.at(-1)?.error,errors}}
 const off=evaluate(final[0]),on=evaluate(final[1]),report={seed,noise,wallMs:performance.now()-start,frames:truth.length,commonOrigin:initial,prefixNoLoop,checksums,truth,streamed,firstApplied,events,off,on,corrections:final[1].vo?.map?.loop.corrections,graph:final[1].vo?.map?.loop.optimization,finalMap:final[1].vo?.map}
 reports.push(report);console.log('RESULT '+JSON.stringify({seed,noise,off:off.rms,on:on.rms,corrections:report.corrections}));Object.assign(window,{__comparisonProgress:reports})
 }finally{workers.forEach(w=>w.terminate())}
 }
 Object.assign(window,{__comparison:reports})
}catch(error){Object.assign(window,{__comparisonError:String(error)});throw error}finally{capture.dispose();environment.dispose();room.dispose();pmrem.dispose();renderer.dispose()}
