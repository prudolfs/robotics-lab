import {
	type CameraPose,
	cameraCenter,
	flipRows,
	type StereoCalibration,
	type Vec3,
} from '@robotics-lab/sensors'
import {
	AmbientLight,
	Color,
	DirectionalLight,
	Group,
	HemisphereLight,
	NoToneMapping,
	type Object3D,
	PerspectiveCamera,
	Scene,
	SRGBColorSpace,
	type Texture,
	Vector3,
	Vector4,
	type WebGLRenderer,
	WebGLRenderTarget,
} from 'three'
export type CaptureAdapter = {
	capture: (
		pose: CameraPose,
		wheels: { left: number; right: number },
		left: ArrayBuffer,
		right: ArrayBuffer,
	) => void
	dispose: () => void
}
/** A separate world: debug paths, presentation cameras, and display-only lighting never enter it. */
export function createCapture(
	renderer: WebGLRenderer,
	models: Object3D[],
	k: StereoCalibration,
	mounts: [Vec3, Vec3],
	environment: Texture | null,
): CaptureAdapter {
	const scene = new Scene()
	scene.background = new Color('#18232b')
	scene.environment = environment
	scene.environmentIntensity = 0.4
	const [lab, walls, rover] = models.map((m) => m.clone(true))
	scene.add(lab, walls)
	const body = new Group()
	body.add(rover)
	scene.add(body)
	const pivots = [rover.getObjectByName('Wheel_Left'), rover.getObjectByName('Wheel_Right')]
	scene.add(new AmbientLight(0xffffff, 0.3), new HemisphereLight(0xd7ebff, 0x4f5350, 1.2))
	const light = new DirectionalLight(0xffecd1, 2.5)
	light.position.set(1, 8, 4)
	scene.add(light)
	const camera = new PerspectiveCamera(),
		near = 0.05,
		far = 30
	camera.projectionMatrix.set(
		(2 * k.fx) / k.width,
		0,
		1 - (2 * k.cx) / k.width,
		0,
		0,
		(2 * k.fy) / k.height,
		(2 * k.cy) / k.height - 1,
		0,
		0,
		0,
		-(far + near) / (far - near),
		(-2 * far * near) / (far - near),
		0,
		0,
		-1,
		0,
	)
	camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
	const target = new WebGLRenderTarget(k.width, k.height, {
		depthBuffer: true,
		stencilBuffer: false,
	})
	target.texture.colorSpace = SRGBColorSpace
	const look = new Vector3()
	return {
		capture(pose, wheels, left, right) {
			if (renderer.getContext().isContextLost())
				throw Error('Graphics context lost; reload or retry after recovery')
			body.position.set(pose.x, 0, -pose.y)
			body.rotation.y = pose.heading
			if (pivots[0]) pivots[0].rotation.z = -wheels.left
			if (pivots[1]) pivots[1].rotation.z = -wheels.right
			const previous = {
				target: renderer.getRenderTarget(),
				viewport: renderer.getViewport(new Vector4()),
				scissor: renderer.getScissor(new Vector4()),
				scissorTest: renderer.getScissorTest(),
				tone: renderer.toneMapping,
				exposure: renderer.toneMappingExposure,
				shadow: renderer.shadowMap.enabled,
				auto: renderer.autoClear,
			}
			try {
				renderer.shadowMap.enabled = false
				renderer.toneMapping = NoToneMapping
				renderer.toneMappingExposure = 1
				renderer.autoClear = true
				renderer.setRenderTarget(target)
				renderer.setViewport(0, 0, k.width, k.height)
				renderer.setScissorTest(false)
				for (const [i, buffer] of [left, right].entries()) {
					const [x, y, z] = cameraCenter(pose, mounts[i])
					camera.position.set(x, z, -y)
					look.set(x + Math.cos(pose.heading), z, -y - Math.sin(pose.heading))
					camera.lookAt(look)
					camera.updateMatrixWorld(true)
					renderer.render(scene, camera)
					const bytes = new Uint8Array(buffer)
					renderer.readRenderTargetPixels(target, 0, 0, k.width, k.height, bytes)
					flipRows(bytes, k.width, k.height)
				}
			} finally {
				renderer.setRenderTarget(previous.target)
				renderer.setViewport(previous.viewport)
				renderer.setScissor(previous.scissor)
				renderer.setScissorTest(previous.scissorTest)
				renderer.toneMapping = previous.tone
				renderer.toneMappingExposure = previous.exposure
				renderer.shadowMap.enabled = previous.shadow
				renderer.autoClear = previous.auto
			}
		},
		dispose() {
			target.dispose()
			scene.clear()
		}, // Clones share GLTF geometry/textures with the loader; do not dispose shared assets.
	}
}
