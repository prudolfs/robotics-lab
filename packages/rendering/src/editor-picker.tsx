// Editor floor interaction (milestone 12 — Editor).
//
// A headless-style R3F component that turns floor clicks / drags into
// world-space editor commands while an editor tool is active. It is the
// editor's twin of `GoalPicker`: an invisible floor plane that captures
// pointer events and reports the picked world point back to the app so the
// store can apply the active tool (add wall, remove wall, move / resize,
// set spawn).
//
// Like `GoalPicker` it is a rendering component only — it knows nothing about
// the simulation or the store. The app wires its callbacks to the store
// actions (see `App.tsx`).
//
// While `tool === 'none'` it renders/does nothing, so the editor overlays can
// stay mounted unconditionally and politely no-op when not editing.

import type { ThreeEvent } from '@react-three/fiber'
import type { World } from '@robotics-lab/core'
import type { Vec2 } from '@robotics-lab/geometry'

export type EditorTool = 'none' | 'addWall' | 'removeWall' | 'move' | 'resize' | 'setSpawn'

export type EditorPickerProps = {
	/** The world, sizes the clickable floor plane. */
	world: World
	/** Active tool; `'none'` disables interaction entirely. */
	tool: EditorTool
	/** Called on a single left click with the picked world point. The app maps
	 *  this to the active tool (add-wall endpoint, remove-wall pick, set-spawn). */
	onPick: (point: Vec2, event: ThreeEvent<MouseEvent>) => void
	/** Called with the world point while the pointer is pressed + dragged
	 *  (live update for move / resize). Only fires while a move/resize tool is
	 *  active. */
	onDrag: (point: Vec2, event: ThreeEvent<PointerEvent>) => void
}

/**
 * Invisible floor plane that routes clicks / drags to the active editor tool.
 * `visible={false}` so it paints nothing; R3F still raycasts it.
 */
export function EditorPicker({ world, tool, onPick, onDrag }: EditorPickerProps) {
	if (tool === 'none') return null
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: R3F mesh, not an HTML element
		<mesh
			position={[0, 0, 0]}
			rotation={[-Math.PI / 2, 0, 0]}
			onClick={(e) => {
				if (e.button !== 0) return
				e.stopPropagation()
				onPick({ x: e.point.x, y: e.point.z }, e)
			}}
			onPointerMove={(e) => {
				if (tool !== 'move' && tool !== 'resize') return
				// Only forward a drag while the primary button is held (R3F reports
				// pressed buttons on `e.buttons`: bit 0 = left).
				if ((e.buttons & 1) === 0) return
				e.stopPropagation()
				onDrag({ x: e.point.x, y: e.point.z }, e)
			}}
			visible={false}
		>
			<planeGeometry args={[world.width, world.depth]} />
			<meshBasicMaterial />
		</mesh>
	)
}
