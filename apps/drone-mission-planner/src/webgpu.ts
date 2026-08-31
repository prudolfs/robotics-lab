import WebGPU from 'three/addons/capabilities/WebGPU.js'
import { WebGPURenderer } from 'three/webgpu'

type RendererCanvasProps = {
	canvas: unknown
}

export function supportsWebGPU(): boolean {
	return WebGPU.isAvailable()
}

export async function createWebGPURenderer(props: RendererCanvasProps) {
	const canvas = props.canvas as HTMLCanvasElement
	const renderer = new WebGPURenderer({
		antialias: true,
		alpha: true,
		canvas,
	})
	await renderer.init()
	// WebGPURenderer allocates its depth attachment during init. Synchronize it
	// with R3F's measured canvas before the first render pass so color and depth
	// never briefly use the canvas default 300x150 size.
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
	renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
	return renderer
}
