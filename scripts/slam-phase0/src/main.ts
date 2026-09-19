import * as T from 'three'
import { WebGPURenderer, RenderPipeline } from 'three/webgpu'
import { pass } from 'three/tsl'
import { bloom as nodeBloom } from 'three/addons/tsl/display/BloomNode.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas } from '@react-three/fiber'

import { calibration } from './geometry'
const status = document.querySelector('#status')!
const report: any = { calibration, browser: navigator.userAgent, renderers: {} }
const scene = new T.Scene()
scene.background = new T.Color('#15222c')
scene.add(new T.HemisphereLight(0xd5e9ff, 0x464035, 2))
const light = new T.DirectionalLight(0xffd9ad, 4)
light.position.set(2, 5, 1)
scene.add(light)
let seed = 42
function random() {
	seed = (1664525 * seed + 1013904223) >>> 0
	return seed / 4294967296
}
function texture() {
	const c = document.createElement('canvas')
	c.width = c.height = 128
	const g = c.getContext('2d')!
	g.fillStyle = '#73888b'
	g.fillRect(0, 0, 128, 128)
	for (let i = 0; i < 200; i++) {
		g.fillStyle = random() > 0.5 ? '#e3dfd3' : '#273438'
		g.fillRect(
			Math.floor(random() * 32) * 4,
			Math.floor(random() * 32) * 4,
			4 + random() * 10,
			4 + random() * 10,
		)
	}
	const t = new T.CanvasTexture(c)
	t.colorSpace = T.SRGBColorSpace
	return t
}
for (let row = 0; row < 3; row++)
	for (let col = 0; col < 5; col++) {
		const m = new T.Mesh(
			new T.BoxGeometry(0.65, 0.55, 0.35),
			new T.MeshStandardMaterial({ map: texture(), roughness: 0.6, metalness: 0.15 }),
		)
		m.position.set((col - 2) * 0.9, (row - 1) * 0.7, -3.4 - random() * 1.5)
		m.rotation.y = (random() - 0.5) * 0.2
		scene.add(m)
	}
const floor = new T.Mesh(
	new T.PlaneGeometry(15, 15),
	new T.MeshStandardMaterial({ color: 0x56646b, roughness: 0.8 }),
)
floor.rotation.x = -Math.PI / 2
floor.position.y = -1.1
scene.add(floor)
const metal = new T.Mesh(
	new T.SphereGeometry(0.3, 32, 16),
	new T.MeshStandardMaterial({ color: 0xa5b2b5, metalness: 0.85, roughness: 0.22 }),
)
metal.position.set(1.6, -0.5, -2.6)
scene.add(metal)
const camera = new T.PerspectiveCamera(
	(2 * Math.atan(480 / (2 * 480)) * 180) / Math.PI,
	640 / 480,
	0.05,
	30,
)
const frames: { left: Uint8Array; right: Uint8Array }[] = []
function flip(raw: Uint8Array) {
	const out = new Uint8Array(raw.length)
	for (let y = 0; y < 480; y++)
		out.set(raw.subarray(y * 640 * 4, (y + 1) * 640 * 4), (479 - y) * 640 * 4)
	return out
}
async function probe(name: string, renderer: any) {
	const canvas = renderer.domElement
	const view = document.createElement('div')
	const label = document.createElement('p')
	label.textContent = name === 'webgl2' ? 'WebGL2 · selected baseline' : 'WebGPU · comparison'
	view.append(label, canvas)
	document.querySelector('#views')!.append(view)
	renderer.setSize(640, 480)
	renderer.setPixelRatio(1)
	renderer.outputColorSpace = T.SRGBColorSpace
	if (name === 'webgpu') await renderer.init()
	const target = new T.WebGLRenderTarget(640, 480, {
		type: T.UnsignedByteType,
		format: T.RGBAFormat,
	})
	const times = []
	for (let i = 0; i < 8; i++) {
		const start = performance.now(),
			pair: any = {}
		for (const [eye, x] of [
			['left', 0],
			['right', 0.12],
		] as const) {
			camera.position.set(
				i * 0.012 + x * Math.cos(i * 0.002),
				0,
				-i * 0.02 - x * Math.sin(i * 0.002),
			)
			camera.rotation.y = i * 0.002
			renderer.setRenderTarget(target)
			renderer.render(scene, camera)
			let raw: Uint8Array
			if (name === 'webgl2') {
				raw = new Uint8Array(640 * 480 * 4)
				await renderer.readRenderTargetPixelsAsync(target, 0, 0, 640, 480, raw)
			} else raw = await renderer.readRenderTargetPixelsAsync(target, 0, 0, 640, 480)
			pair[eye] = flip(raw)
		}
		times.push(performance.now() - start)
		if (name === 'webgl2' && i < 5) frames.push(pair)
	}
	renderer.setRenderTarget(null)
	camera.position.set(0, 0, 0)
	camera.rotation.set(0, 0, 0)
	renderer.render(scene, camera)
	const renderStats = {
		triangles: renderer.info.render.triangles,
		drawCalls: renderer.info.render.calls,
	}
	let bloom = ''
	if (name === 'webgl2') {
		const composer = new EffectComposer(renderer)
		composer.addPass(new RenderPass(scene, camera))
		composer.addPass(new UnrealBloomPass(new T.Vector2(640, 480), 0.12, 0.3, 0.9))
		composer.render()
		bloom = 'EffectComposer + UnrealBloomPass rendered'
		composer.dispose()
	} else {
		const pipeline = new RenderPipeline(renderer)
		const scenePass = pass(scene, camera)
		// Limit generic TSL inference at this experimental renderer boundary.
		const color: any = scenePass.getTextureNode('output')
		pipeline.outputNode = color.add(nodeBloom(color, 0.12, 0.3, 0.9))
		pipeline.render()
		bloom = 'TSL RenderPipeline + BloomNode rendered'
		pipeline.dispose()
		scenePass.dispose()
	}
	report.renderers[name] = {
		stereoCaptureMs: times,
		steadyMeanMs: times.slice(2).reduce((a, b) => a + b, 0) / 6,
		bloom,
		...renderStats,
		backend:
			name === 'webgpu' ? (renderer.backend.isWebGPUBackend ? 'WebGPU' : 'fallback') : 'WebGL2',
	}
	target.dispose()
	return renderer
}
async function main() {
	const gltf = await new GLTFLoader().loadAsync('/blender/material-probe.glb')
	gltf.scene.position.set(-0.5, -0.8, -2.5)
	scene.add(gltf.scene)
	report.blenderAsset = 'GLB loaded and rendered'
	await probe('webgl2', new T.WebGLRenderer({ antialias: true }))
	try {
		await probe('webgpu', new WebGPURenderer({ antialias: true }))
	} catch (e) {
		report.renderers.webgpu = { error: String(e) }
	}
	status.textContent = 'Renderers complete; running pixel processing'
	const tsWorker = new Worker(new URL('./ts-worker.ts', import.meta.url), { type: 'module' })
	report.typescript = await new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(Error('TypeScript worker timeout')), 10000)
		tsWorker.onmessage = (e) => {
			clearTimeout(timer)
			resolve(e.data)
		}
		tsWorker.onerror = (e) => {
			clearTimeout(timer)
			reject(Error(e.message))
		}
		tsWorker.postMessage({ frames })
	})
	tsWorker.terminate()
	const worker = new Worker('/cv-worker.js')
	report.opencv = await new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(Error('OpenCV worker timeout')), 60000)
		worker.onmessage = (e) => {
			clearTimeout(timer)
			resolve(e.data)
		}
		worker.onerror = (e) => {
			clearTimeout(timer)
			reject(Error(e.message))
		}
		worker.postMessage({ frames })
	})
	worker.terminate()
	report.truth = frames.slice(1).map((_, k) => {
		const i = k + 1,
			a = i * 0.002
		return {
			pose: [
				0,
				a,
				0,
				-Math.cos(a) * i * 0.012 - Math.sin(a) * i * 0.02,
				0,
				Math.sin(a) * i * 0.012 - Math.cos(a) * i * 0.02,
			],
		}
	})
	for (const name of ['typescript', 'opencv'])
		if (report[name].results)
			report[name].results.forEach((r: any, i: number) => {
				r.translationErrorM = Math.hypot(
					...r.pose.slice(3).map((v: number, j: number) => v - report.truth[i].pose[j + 3]),
				)
				r.rotationVectorErrorRad = Math.hypot(
					...r.pose.slice(0, 3).map((v: number, j: number) => v - report.truth[i].pose[j]),
				)
			})
	report.r3f = {}
	for (const backend of ['webgl2', 'webgpu']) {
		const container = document.createElement('div')
		container.style.cssText = 'width:200px;height:140px;display:inline-block'
		document.querySelector('#r3f')!.append(container)
		await new Promise<void>((resolve, reject) => {
			const timer = setTimeout(() => reject(Error('R3F mount timeout')), 10000)
			createRoot(container).render(
				createElement(
					Canvas,
					{
						...(backend === 'webgpu'
							? {
									gl: async (props: any) => {
										const renderer = new WebGPURenderer({ canvas: props.canvas })
										await renderer.init()
										return renderer
									},
								}
							: {}),
						onCreated: ({ gl }: any) => {
							setTimeout(() => {
								report.r3f[backend] = { mounted: true, renderCalls: gl.info.render.calls }
								clearTimeout(timer)
								resolve()
							}, 250)
						},
					},
					createElement(
						'mesh',
						null,
						createElement('boxGeometry'),
						createElement('meshNormalMaterial'),
					),
				),
			)
		})
	}
	;(window as any).__frames = frames
	;(window as any).__report = report
	status.textContent = JSON.stringify(report, null, 2)
}
main().catch((e) => {
	status.textContent = String(e) + '\n' + e.stack
	;(window as any).__error = String(e)
})
