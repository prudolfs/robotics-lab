import { Group, Mesh, MeshBasicMaterial, SphereGeometry, WebGLRenderer } from '../../apps/slam-demo/node_modules/three/build/three.module.js'
import { createCapture } from '../../apps/slam-demo/src/sensor/capture'
const k={width:640,height:480,fx:480,fy:480,cx:300,cy:210,baseline:.12,captureHz:10}
const renderer=new WebGLRenderer({antialias:false});renderer.setSize(640,480);document.body.append(renderer.domElement)
const lab=new Group(),marker=new Mesh(new SphereGeometry(.025,16,12),new MeshBasicMaterial({color:0xff0000}))
// Optical left coordinates (0,-.2,2), including an off-center principal point.
marker.position.set(2.16,.65,-.06);lab.add(marker)
const adapter=createCapture(renderer,[lab,new Group(),new Group()],k,[[.16,.06,.45],[.16,-.06,.45]],null)
const left=new ArrayBuffer(640*480*4),right=left.slice(0)
adapter.capture({x:0,y:0,heading:0},{left:0,right:0},left,right)
function center(buffer:ArrayBuffer){let x=0,y=0,n=0;const data=new Uint8Array(buffer);for(let i=0;i<data.length;i+=4)if(data[i]>200&&data[i+1]<40&&data[i+2]<40){const p=i/4;x+=p%640;y+=Math.floor(p/640);n++}if(!n)throw Error('No marker pixels');return {u:x/n+.5,v:y/n+.5,pixels:n}}
const l=center(left),r=center(right)
if(Math.abs(l.u-300)>.6||Math.abs(l.v-162)>.6||Math.abs(l.v-r.v)>.6||Math.abs(l.u-r.u-28.8)>.6)throw Error('Stereo calibration does not match GPU pixels: '+JSON.stringify({l,r}))
const result={left:l,right:r,disparity:l.u-r.u,expected:{left:[300,162],right:[271.2,162],disparity:28.8},renderTargetRestored:renderer.getRenderTarget()===null}
const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;canvas.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(left),640,480),0,0);document.body.append(canvas)
Object.assign(window,{__stereoGpu:result});adapter.dispose();renderer.dispose()
