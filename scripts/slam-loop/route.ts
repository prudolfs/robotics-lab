import { WebGLRenderer, PMREMGenerator } from '../../apps/slam-demo/node_modules/three/build/three.module.js'
import { GLTFLoader } from '../../apps/slam-demo/node_modules/three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from '../../apps/slam-demo/node_modules/three/examples/jsm/loaders/DRACOLoader.js'
import { RoomEnvironment } from '../../apps/slam-demo/node_modules/three/examples/jsm/environments/RoomEnvironment.js'
import { createCapture } from '../../apps/slam-demo/src/sensor/capture'
import { createVisualEvaluation } from '../../apps/slam-demo/src/sensor/visual'
import { createSimulation,setStatus,stepSimulation } from '../../apps/slam-demo/src/sim/simulation'
import manifest from '../../assets/slam-demo/manifest.json'
import type { Vec3,StereoFrame } from '../../packages/sensors/src/stereo'
import type { VisionFrame } from '../../apps/slam-demo/src/sensor/visual'
const renderer=new WebGLRenderer();renderer.setSize(640,480);document.body.append(renderer.domElement)
const loader=new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath('/assets/slam/draco/'))
const models=await Promise.all(['lab','cutaway','rover'].map(name=>loader.loadAsync(`/assets/slam/${name}.glb`)))
const room=new RoomEnvironment(),pmrem=new PMREMGenerator(renderer),environment=pmrem.fromScene(room,.04)
const capture=createCapture(renderer,models.map(m=>m.scene),manifest.calibration,[manifest.mounts.Camera_Left,manifest.mounts.Camera_Right] as [Vec3,Vec3],environment.texture)
const worker=new Worker('/vision/worker.js'),evaluate=createVisualEvaluation(),measurements:unknown[]=[]
let simulation=setStatus(createSimulation({noise:false}),'running'),last=-1,lastBundleRevision=0,lastEvent=-1
const process=(frame:StereoFrame & {vision?:{loopClosure:boolean;synchronous:boolean}})=>new Promise<VisionFrame>((resolve,reject)=>{worker.onmessage=({data})=>data.error?reject(Error(data.error)):resolve(data);worker.onerror=e=>reject(Error(e.message));worker.postMessage(frame,[frame.left,frame.right])})
const start=performance.now()
try {
 while(simulation.status==='running'){
  if(simulation.tick%6===0&&simulation.tick!==last){
   last=simulation.tick
   const frameId=simulation.tick/6,left=new ArrayBuffer(640*480*4),right=left.slice(0)
   capture.capture(simulation.truth.pose,simulation.wheelAngles,left,right)
   const result=await process({generation:0,frameId,timestamp:frameId/10,calibration:manifest.calibration,kind:'rendered',left,right,vision:{loopClosure:true,synchronous:true}})
   evaluate.accept(result.vo,simulation.truth.pose)
   const metric=evaluate.snapshot(),v=result.vo
   for(const e of v?.map?.loop.events??[])if(e.id>lastEvent){if(e.kind!=="candidate")console.log("LOOP "+JSON.stringify(e));lastEvent=e.id}
   if(v?.map){if(JSON.stringify(v.pose)!==JSON.stringify(v.map.pose))throw Error('Mixed pose/map revision');if(v.map.landmarks.length>1000||v.map.keyframes.length>12)throw Error('Map cap exceeded')}
   Object.assign(window,{__finalMap:v?.map})
   measurements.push({frameId,timestamp:frameId/10,status:v?.status,reason:v?.reason,stereo:v?.stereo,matches:v?.matches,inliers:v?.inliers,rmse:v?.rmse,positionError:metric.error,trajectoryRms:metric.rms,pose:v?.pose,truth:{...simulation.truth.pose},nativeObjects:v?.nativeObjects,peakNativeObjects:v?.peakNativeObjects,processingMs:result.processingMs,mapRevision:v?.map?.revision,mapPoints:v?.map?.landmarks.length,keyframes:v?.map?.keyframes.length,mapMatches:v?.map?.mapMatches,trackingSource:v?.map?.trackingSource,mapUpdateMs:v?.map?.updateMs,bundle:v?.map&&v.map.bundleRevision!==lastBundleRevision?v.map.bundle:null})
   lastBundleRevision=v?.map?.bundleRevision??0
   document.getElementById('status')!.textContent=`${frameId}/757 · ${v?.status} · ${metric.error?.toFixed(3)??'—'} m`
  }
  simulation=stepSimulation(simulation)
 }
 Object.assign(window,{__routeReview:{measurements,wallMs:performance.now()-start,evaluation:evaluate.snapshot(),finalMap:Reflect.get(window,"__finalMap")}})
}catch(error){Object.assign(window,{__routeError:String(error)});throw error}finally{worker.terminate();capture.dispose();environment.dispose();room.dispose();pmrem.dispose();renderer.dispose()}
