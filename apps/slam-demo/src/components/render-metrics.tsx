import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import type { SimulationController } from '../sim/controller'
import { usePresentation } from '../store'
export type RenderSample = {
	frameMs: number[]
	drawCalls: number
	triangles: number
	geometries: number
	textures: number
	camera: string
	quality: string
	wheelAngles: { left: number; right: number }
}
declare global {
	interface Window {
		__slamRenderMetrics?: Readonly<RenderSample>
	}
}
// Read-only diagnostics. No simulation setters, clock controls or test-only mutations.
export function RenderMetrics({ controller }: { controller: SimulationController }) {
	const { gl } = useThree()
	const times = useRef<number[]>([])
	const camera = usePresentation((s) => s.camera),
		quality = usePresentation((s) => s.quality)
	const session = useRef('')
	useEffect(
		() => () => {
			delete window.__slamRenderMetrics
		},
		[],
	)
	useFrame((_, dt) => {
		const key = `${camera}/${quality}`
		if (session.current !== key) {
			times.current = []
			session.current = key
		}
		times.current.push(dt * 1000)
		if (times.current.length > 3600) times.current.shift()
		if (times.current.length % 10 === 0)
			window.__slamRenderMetrics = {
				frameMs: [...times.current],
				drawCalls: gl.info.render.calls,
				triangles: gl.info.render.triangles,
				geometries: gl.info.memory.geometries,
				textures: gl.info.memory.textures,
				camera,
				quality,
				wheelAngles: { ...controller.read().wheelAngles },
			}
	})
	return null
}
