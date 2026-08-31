import WebGPU from 'three/addons/capabilities/WebGPU.js'
import { WebGPURenderer } from 'three/webgpu'

type RendererCanvasProps = {
	canvas: unknown
}

export function supportsWebGPU(): boolean {
	return WebGPU.isAvailable()
}

export async function createWebGPURenderer(props: RendererCanvasProps) {
	const renderer = new WebGPURenderer({
		antialias: true,
		alpha: true,
		canvas: props.canvas as HTMLCanvasElement,
	})
	await renderer.init()
	return renderer
}
