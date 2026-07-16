// Editor overlay visualization (milestone 12 — Editor).
//
// Draws editor affordances on the scene while an editor tool is active:
//   - the first endpoint of the wall being drawn (a small marker + a line to
//     the live cursor preview point, when supplied),
//   - a highlight ring around the selected obstacle (box / cylinder),
//   - resize handles on a selected box (the four edge midpoints) for the
//     resize tool.
//
// Pure and observer-only — it owns no simulation state. The app feeds it the
// current editor state from the store. Returns `null` when there is nothing
// to draw so `App` can mount it unconditionally.

import type { Pose, World } from '@robotics-lab/core'
import type { Vec2 } from '@robotics-lab/geometry'
import { useMemo } from 'react'
import * as THREE from 'three'
import { worldToScene } from './coords'

const LAYER_ELEVATION = 0.05
const WALL_START_COLOR = 0xf59e0b // amber
const SELECTION_COLOR = 0x22d3ee // cyan
const HANDLE_COLOR = 0xf59e0b

export type EditorSelectionView =
	| { kind: 'none' }
	| { kind: 'box'; index: number; center: Vec2; width: number; depth: number; rotation: number }
	| { kind: 'cylinder'; index: number; center: Vec2; radius: number }

export type EditorOverlayProps = {
	tool: 'none' | 'addWall' | 'removeWall' | 'move' | 'resize' | 'setSpawn'
	/** First endpoint of the wall being drawn (null until the first click). */
	wallStart: Vec2 | null
	/** Live cursor preview point while drawing a wall (the mouse position); when
	 *  set, a faint preview line is drawn from `wallStart` to here. */
	wallPreview: Vec2 | null
	/** Spawn pose marker (drawn while `setSpawn` tool is active). */
	spawn: Pose | null
	/** The obstacle the editor has highlighted for move / resize. */
	selection: EditorSelectionView
	/** The world, used to clamp/size overlays when needed. */
	world: World
}

/**
 * Render the editor's scene overlays. Returns `null` when the tool is idle or
 * there is nothing to draw.
 */
export function EditorOverlay({
	tool,
	wallStart,
	wallPreview,
	spawn,
	selection,
}: EditorOverlayProps) {
	if (tool === 'none') return null
	return (
		<group position={[0, LAYER_ELEVATION, 0]} renderOrder={6}>
			{tool === 'addWall' && wallStart && (
				<WallStartMarker start={wallStart} preview={wallPreview} />
			)}
			{tool === 'setSpawn' && spawn && <SpawnMarker pose={spawn} />}
			{(tool === 'move' || tool === 'resize') && selection.kind !== 'none' && (
				<SelectionHighlight selection={selection} showHandles={tool === 'resize'} />
			)}
		</group>
	)
}

/** An amber dot at the recorded wall start, plus a faint line to the preview
 *  cursor when one is supplied. */
function WallStartMarker({ start, preview }: { start: Vec2; preview: Vec2 | null }) {
	const line = useMemo(() => {
		if (!preview) return null
		const a = worldToScene(start, 0)
		const b = worldToScene(preview, 0)
		const pos = new Float32Array([...a, ...b])
		return new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3))
	}, [start, preview])
	return (
		<group>
			<mesh position={worldToScene(start, 0)}>
				<sphereGeometry args={[0.06, 12, 12]} />
				<meshBasicMaterial color={WALL_START_COLOR} />
			</mesh>
			{line && (
				<lineSegments>
					<primitive object={line} attach="geometry" />
					<lineBasicMaterial color={WALL_START_COLOR} transparent opacity={0.5} />
				</lineSegments>
			)}
		</group>
	)
}

/** A magenta dot + small ring at the spawn pose (while placing it). */
function SpawnMarker({ pose }: { pose: Pose }) {
	const [x, , z] = worldToScene(pose, 0)
	const yaw = -pose.heading
	return (
		<group position={[x, 0, z]} rotation={[0, yaw, 0]}>
			<mesh rotation={[-Math.PI / 2, 0, 0]}>
				<torusGeometry args={[0.18, 0.02, 10, 32]} />
				<meshBasicMaterial color={SELECTION_COLOR} transparent opacity={0.9} depthWrite={false} />
			</mesh>
			<mesh position={[0.18, 0, 0]}>
				<boxGeometry args={[0.18, 0.02, 0.03]} />
				<meshBasicMaterial color={SELECTION_COLOR} transparent opacity={0.95} depthWrite={false} />
			</mesh>
		</group>
	)
}

/** Cyan ring around the selected obstacle, plus amber resize handles when
 *  the resize tool is active (boxes only). */
function SelectionHighlight({
	selection,
	showHandles,
}: {
	selection: Exclude<EditorSelectionView, { kind: 'none' }>
	showHandles: boolean
}) {
	if (selection.kind === 'cylinder') return <CylinderSelection selection={selection} />
	if (selection.kind === 'box')
		return <BoxSelection selection={selection} showHandles={showHandles} />
	return null
}

/** Cyan ring around a selected cylinder. */
function CylinderSelection({
	selection,
}: {
	selection: Extract<EditorSelectionView, { kind: 'cylinder' }>
}) {
	const [x, , z] = worldToScene(selection.center, 0)
	return (
		<mesh position={[x, 0, z]} rotation={[-Math.PI / 2, 0, 0]}>
			<torusGeometry args={[selection.radius + 0.05, 0.02, 10, 48]} />
			<meshBasicMaterial color={SELECTION_COLOR} transparent opacity={0.9} depthWrite={false} />
		</mesh>
	)
}

/** Cyan outline of an oriented box + amber resize handles at its edge
 *  midpoints when the resize tool is active. */
function BoxSelection({
	selection,
	showHandles,
}: {
	selection: Extract<EditorSelectionView, { kind: 'box' }>
	showHandles: boolean
}) {
	const corners = useMemo(() => boxCorners(selection), [selection])
	const outline = useMemo(() => {
		const pos = new Float32Array(corners.length * 2 * 3)
		let w = 0
		for (let i = 0; i < corners.length; i++) {
			const a = worldToScene(corners[i], 0)
			const b = worldToScene(corners[(i + 1) % corners.length], 0)
			pos[w++] = a[0]
			pos[w++] = a[1]
			pos[w++] = a[2]
			pos[w++] = b[0]
			pos[w++] = b[1]
			pos[w++] = b[2]
		}
		return new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3))
	}, [corners])
	const edgeMids = useMemo(() => boxEdgeMidpoints(selection), [selection])
	return (
		<group>
			<lineSegments>
				<primitive object={outline} attach="geometry" />
				<lineBasicMaterial color={SELECTION_COLOR} transparent opacity={0.9} />
			</lineSegments>
			{showHandles &&
				edgeMids.map((m, i) => (
					<mesh key={`h-${i}-${m.x}-${m.y}`} position={worldToScene(m, 0)}>
						<sphereGeometry args={[0.05, 10, 10]} />
						<meshBasicMaterial color={HANDLE_COLOR} />
					</mesh>
				))}
		</group>
	)
}

/** The 4 world-space corners of an oriented box (clockwise). */
function boxCorners(b: { center: Vec2; width: number; depth: number; rotation: number }): Vec2[] {
	const hw = b.width / 2
	const hd = b.depth / 2
	const local: Vec2[] = [
		{ x: -hw, y: -hd },
		{ x: hw, y: -hd },
		{ x: hw, y: hd },
		{ x: -hw, y: hd },
	]
	const c = Math.cos(b.rotation)
	const s = Math.sin(b.rotation)
	return local.map((p) => ({
		x: b.center.x + p.x * c - p.y * s,
		y: b.center.y + p.x * s + p.y * c,
	}))
}

/** Midpoints of the 4 box edges (world space) — anchor points for resize handles. */
function boxEdgeMidpoints(b: {
	center: Vec2
	width: number
	depth: number
	rotation: number
}): Vec2[] {
	const local: Vec2[] = [
		{ x: b.width / 2, y: 0 },
		{ x: 0, y: b.depth / 2 },
		{ x: -b.width / 2, y: 0 },
		{ x: 0, y: -b.depth / 2 },
	]
	const c = Math.cos(b.rotation)
	const s = Math.sin(b.rotation)
	return local.map((p) => ({
		x: b.center.x + p.x * c - p.y * s,
		y: b.center.y + p.x * s + p.y * c,
	}))
}
