// Robot first-person camera viewport.
//
// The robot carries an onboard perspective camera that looks forward along its
// heading. This module renders that camera's view into a HUD inset using a
// dedicated, self-contained `Canvas` (react-three-fiber) rather than drei's
// in-canvas `<View>` portal: a second scene graph costs a little throughput
// but is fully isolated from the orbit canvas — no shared scissor/viewport
// state, no positive `useFrame` priority that disables the orbit's auto-loop,
// and no risk of the orbit view dropping out when the camera toggles on or
// leaving a stale viewport when it toggles off.
//
// The inner canvas re-observes the same immutable `world` and `pose` the main
// canvas renders, so the camera sees exactly the same world (lights, obstacles,
// robot body) just from the robot's POV. Camera controls = a vertical drag on
// the viewport that adjusts a look-up / look-down pitch.

import { Canvas, useFrame } from '@react-three/fiber'
import type { Pose, World } from '@robotics-lab/core'
import type * as React from 'react'
import { useRef } from 'react'
import { RobotView } from './robot-view'
import { WorldView } from './world-view'

const DEFAULT_EYE_HEIGHT = 0.18
const DEFAULT_FOV = 70
const DEFAULT_WIDTH = 256
const DEFAULT_HEIGHT = 192

export type CameraNoiseLevel = 'none' | 'low' | 'medium' | 'high'

function noiseOpacity(level: CameraNoiseLevel): number {
	switch (level) {
		case 'low':
			return 0.05
		case 'medium':
			return 0.15
		case 'high':
			return 0.35
		default:
			return 0
	}
}

export type RobotCameraViewportProps = {
	/** The world to render inside the camera view. */
	world: World
	/** Robot pose the camera follows. */
	pose: Pose
	/** Robot body params (so the robot renders inside its own camera). */
	robotParams?: React.ComponentProps<typeof RobotView>['params']
	/** Render the viewport only when `active`. */
	active?: boolean
	/** HUD-inset dimensions, in pixels. */
	width?: number
	height?: number
	/** Camera tilt in radians; updated by dragging the viewport. */
	pitch?: number
	onPitch?: (rad: number) => void
	className?: string
	/** DOM ref to the inset box, for parent layout / drag handling. */
	trackRef?: React.RefObject<HTMLDivElement | null>
	/** Image noise level applied over the rendered camera feed. */
	noise?: CameraNoiseLevel
}

/**
 * A HUD inset rendering the robot's first-person view. Render it outside the
 * main `<Canvas>` (its children form their own isolated scene graph). The
 * inner `<Canvas>` re-renders the world+robot from a camera that tracks the
 * robot pose each frame; drag inside the inset to look up / down.
 */
export function RobotCameraViewport({
	world,
	pose,
	robotParams,
	active = true,
	width = DEFAULT_WIDTH,
	height = DEFAULT_HEIGHT,
	pitch = 0,
	onPitch,
	className,
	trackRef,
	noise = 'none',
}: RobotCameraViewportProps) {
	if (!active) return null
	return (
		<div
			ref={trackRef}
			className={className}
			style={{ width, height, touchAction: 'none', position: 'relative' }}
			aria-label="Robot camera viewport"
			role="img"
			data-testid="camera-viewport"
		>
			<CameraCanvas
				world={world}
				pose={pose}
				robotParams={robotParams}
				pitch={pitch}
				onPitch={onPitch}
			/>
			<CameraNoiseOverlay width={width} height={height} noise={noise} />
		</div>
	)
}

/** Self-contained mini-canvas for the robot POV, including its own lights. */
function CameraCanvas({
	world,
	pose,
	robotParams,
	pitch,
	onPitch,
}: {
	world: World
	pose: Pose
	robotParams?: RobotCameraViewportProps['robotParams']
	pitch: number
	onPitch?: (rad: number) => void
}) {
	const dragging = useRef(false)
	return (
		<Canvas
			shadows
			camera={{
				fov: DEFAULT_FOV,
				near: 0.05,
				far: 50,
				position: [pose.x, DEFAULT_EYE_HEIGHT, pose.y],
			}}
			onPointerDown={(e) => {
				dragging.current = true
				;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
			}}
			onPointerUp={() => {
				dragging.current = false
			}}
			onPointerMove={(e) => {
				if (!dragging.current || !onPitch) return
				const delta = e.movementY / 200
				const next = Math.max(-0.6, Math.min(0.4, pitch - delta))
				onPitch(next)
			}}
			style={{ width: '100%', height: '100%' }}
		>
			<CameraFollower pose={pose} pitch={pitch} />
			<Lights />
			<WorldView world={world} />
			<RobotView pose={pose} params={robotParams} />
		</Canvas>
	)
}

/** Drive the default camera to the robot pose every frame. */
function CameraFollower({ pose, pitch }: { pose: Pose; pitch: number }) {
	useFrame((state) => {
		const cam = state.camera
		// Robot forward is +x in world rotated by `heading`; in scene space that
		// maps to a forward vector at heading angle (scene yaw = -heading), so a
		// camera that looks "robot-forward" sits at scene yaw = -heading - π/2
		// (the default three camera looks down -z). Apply pitch about the
		// camera-local X axis last via YXZ Euler order.
		cam.position.set(pose.x, DEFAULT_EYE_HEIGHT, pose.y)
		cam.rotation.set(-(pitch ?? 0), -pose.heading - Math.PI / 2, 0, 'YXZ')
	})
	return null
}

/** Lights tuned for a small, bright inset (independent of the orbit view). */
function Lights() {
	return (
		<>
			<hemisphereLight args={[0xffffff, 0x444444, 0.7]} />
			<directionalLight position={[8, 12, 6]} intensity={0.6} />
			<ambientLight intensity={0.25} />
		</>
	)
}

/** SVG static-noise overlay rendered on top of the camera viewport.
 *  Pure CSS noise via feTurbulence; no WebGL post-processing needed. */
function CameraNoiseOverlay({
	width,
	height,
	noise,
}: {
	width: number
	height: number
	noise: CameraNoiseLevel
}) {
	const opacity = noiseOpacity(noise)
	if (opacity <= 0) return null
	return (
		<svg
			width={width}
			height={height}
			style={{
				position: 'absolute',
				top: 0,
				left: 0,
				pointerEvents: 'none',
				zIndex: 1,
				mixBlendMode: 'overlay',
				opacity,
			}}
		>
			<filter id="noise">
				<feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves={3} stitchTiles="stitch" />
			</filter>
			<rect width="100%" height="100%" filter="url(#noise)" />
		</svg>
	)
}
