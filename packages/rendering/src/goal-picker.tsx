// Click destination: a transparent invisible plane lain over the floor that
// captures pointer clicks and reports the picked world-space point back to the
// application, so the user can click to send the robot there.
//
// The picker is a rendering component only — it knows nothing about goals or
// the simulation. It just maps a scene-space hit into world (x, y) via the
// shared `worldToScene` inverse convention and calls `onPick` with it and the
// triggering pointer event (so the app can read modifiers, e.g. Shift to
// queue a goal rather than replace the queue).
//
// The plane is sized to the world floor and sits exactly on it (y=0). It is
// rendered `visible=false` so it never paints anything, only captures events.

import type { ThreeEvent } from '@react-three/fiber'
import type { World } from '@robotics-lab/core'
import type { Vec2 } from '@robotics-lab/geometry'

export type GoalPickerProps = {
	/** The world, used to size the clickable plane. */
	world: World
	/** Called with the picked world point and the originating event. */
	onPick: (point: Vec2, event: ThreeEvent<MouseEvent>) => void
	/** Disable picking (e.g. while paused or hidden). */
	enabled?: boolean
}

/**
 * An invisible plane that turns a click on the floor into a world-point
 * callback. `event.point` is already a Three world-space intersection; we
 * project (x, z) onto the world (x, y) plane following the shared convention.
 */
export function GoalPicker({ world, onPick, enabled = true }: GoalPickerProps) {
	if (!enabled) return null
	return (
		// Parent default pointer handlers: stopPropagation could swallow orbit
		// control drags; keep plain onClick so the camera still orbits.
		// biome-ignore lint/a11y/noStaticElementInteractions: R3F mesh, not an HTML element
		<mesh
			position={[0, 0, 0]}
			rotation={[-Math.PI / 2, 0, 0]}
			onClick={(e) => {
				// Only count single primary clicks; ignore right/middle and drags.
				if (e.button !== 0) return
				e.stopPropagation()
				// `e.point` is world-space; xy in scene -> xz plane, with world.y = scene.z.
				onPick({ x: e.point.x, y: e.point.z }, e)
			}}
			visible={false}
		>
			<planeGeometry args={[world.width, world.depth]} />
			<meshBasicMaterial />
		</mesh>
	)
}
