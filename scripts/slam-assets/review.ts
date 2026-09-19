import * as T from '../../apps/slam-demo/node_modules/three/build/three.module.js'
import {GLTFLoader} from '../../apps/slam-demo/node_modules/three/examples/jsm/loaders/GLTFLoader.js'
import {DRACOLoader} from '../../apps/slam-demo/node_modules/three/examples/jsm/loaders/DRACOLoader.js'
import {RoomEnvironment} from '../../apps/slam-demo/node_modules/three/examples/jsm/environments/RoomEnvironment.js'
const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;document.body.append(renderer.domElement)
const scene=new T.Scene();scene.background=new T.Color('#17262f');const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment();scene.environment=pmrem.fromScene(room,.04).texture;scene.environmentIntensity=.45
const camera=new T.PerspectiveCamera(42,innerWidth/innerHeight,.05,30);camera.position.set(-.8,2.25,-.25);camera.lookAt(-2.3,1.05,-3.3)
scene.add(new T.HemisphereLight(0xd7ebff,0x59544b,1.3));const key=new T.DirectionalLight(0xffdcaa,3);key.position.set(-1,5,-1);key.castShadow=true;key.shadow.normalBias=.02;key.shadow.bias=-.0001;key.shadow.mapSize.set(2048,2048);scene.add(key)
const loader=new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath('/assets/slam/draco/'))
const asset=await loader.loadAsync('/assets/slam/workbench.glb');asset.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});scene.add(asset.scene)
const floor=new T.Mesh(new T.PlaneGeometry(20,20),new T.MeshStandardMaterial({color:0x35494e,roughness:.85}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor)
renderer.render(scene,camera);window.__benchReady={triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls}
