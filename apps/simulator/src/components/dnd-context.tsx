// dnd-kit drag context for widget pop-out (docs/hud.md Phase 3).
//
// Replaces the brittle native HTML5 drag-and-drop (which was not firing
// reliably in the browser and was un-testable through Playwright) with
// `@dnd-kit/core`. dnd-kit uses pointer events, so it works with a real mouse
// in the browser *and* is drivable by Playwright's `mouse` API.
//
// The interaction model (per docs Phase 3, "move not duplicate"):
//   - The drag source is a widget's drag handle inside the right panel (or a
//     popped widget's drag handle for re-docking). `data-widget` carries the
//     kind, `data-drag-mode` distinguishes "panel-out" vs "popped-redock".
//   - The drop targets are the four **edge** zones (top/right/bottom/left)
//     overlaying the viewport — the simulation centre is never a drop target.
//   - On drag start the store closes the right panel (so the viewport is fully
//     reachable) and mounts the edge zones.
//   - On drop onto an edge zone the widget is **moved** to that edge
//     (singleton: re-dropping the same kind moves it to the new edge); the
//     panel copy of the widget is hidden while it's docked on the viewport.
//     The popped copy shows a **close button** instead of a drag handle.
//   - On drop outside any zone the drag cancels and the panel reopens.
//   - On drop cancelled / aborted, the panel reopens and nothing pops.
//
// A `DragOverlay` renders a lightweight ghost of the dragged widget kind so the
// pointer has something to follow.

import {
	DndContext,
	type DragCancelEvent,
	type DragEndEvent,
	DragOverlay,
	type DragStartEvent,
	PointerSensor,
	useDraggable,
	useDroppable,
	useSensor,
	useSensors,
} from '@dnd-kit/core'
import { type ReactNode, useState } from 'react'
import { cn } from '@/lib/utils'
import { type DropEdge, useSimulatorStore, type WidgetId } from '@/store'

/** Active drag payload, stored so DragOverlay knows what to render. */
type ActiveDrag = {
	widget: WidgetId
	/** 'pop' = dragging out of the panel; 'redock' = dragging a popped handle. */
	mode: 'pop' | 'redock'
}

/** The only thing exported; renders the provider children. */
export function DndProvider({ children }: { children: ReactNode }) {
	const [active, setActive] = useState<ActiveDrag | null>(null)
	const startDragWidget = useSimulatorStore((s) => s.startDragWidget)
	const dropPoppedWidget = useSimulatorStore((s) => s.dropPoppedWidget)
	const cancelDragWidget = useSimulatorStore((s) => s.cancelDragWidget)

	// 8px activation threshold so a click on the handle doesn't start a drag.
	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

	const onDragStart = (e: DragStartEvent) => {
		const data = e.active.data.current as ActiveDrag | undefined
		if (!data) return
		setActive(data)
		// Closing the panel mounts the edge drop zones over the viewport.
		startDragWidget(data.widget)
	}

	const onDragEnd = (e: DragEndEvent) => {
		const widget = active?.widget
		setActive(null)
		if (!widget) return
		const edge = e.over?.data.current?.edge as DropEdge | undefined
		if (edge) dropPoppedWidget(widget, edge)
		else cancelDragWidget()
	}

	const onDragCancel = (_e: DragCancelEvent) => {
		setActive(null)
		cancelDragWidget()
	}

	return (
		<DndContext
			sensors={sensors}
			onDragStart={onDragStart}
			onDragEnd={onDragEnd}
			onDragCancel={onDragCancel}
		>
			{children}
			<DragOverlay dropAnimation={null}>
				{active ? <DragGhost widget={active.widget} /> : null}
			</DragOverlay>
		</DndContext>
	)
}

/** A small floating ghost that follows the pointer during the drag. */
function DragGhost({ widget }: { widget: WidgetId }) {
	return (
		<div
			className={cn(
				'pointer-events-none flex max-w-xs items-center gap-2 rounded-lg border border-border bg-card/90 px-3 py-2 shadow-2xl backdrop-blur-md',
			)}
		>
			<GripIcon />
			<span className="truncate font-semibold text-foreground text-sm">
				{WIDGET_TITLES[widget]}
			</span>
		</div>
	)
}

export const WIDGET_TITLES: Record<WidgetId, string> = {
	'sensors.lidar': 'Sensors',
	'sensors.camera.controls': 'Camera',
	'sensors.camera.feed': 'Camera feed',
	'map.controls': 'Map',
	'map.minimap': 'Minimap',
	'nav.navigation': 'Navigation',
	'nav.localization': 'Localization',
	'teleop.controls': 'Teleop',
	'utils.robotDebug': 'Robot debug',
	'utils.logs': 'System Logs',
}

/** Shared drag-handle icon (matches the panel/popped visual). */
export function GripIcon({ className }: { className?: string }) {
	return (
		<span className={cn('text-muted-foreground/60', className)} aria-hidden="true">
			⠿
		</span>
	)
}

/**
 * Make a handle draggable. Returns props to spread on the handle element +
 * whether a drag of this handle is active (for styling).
 */
export function useWidgetDragHandle(widget: WidgetId, mode: 'pop' | 'redock') {
	const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
		id: `${mode}:${widget}`,
		data: { widget, mode },
	})
	return {
		dragHandleProps: {
			ref: setNodeRef as unknown as (el: HTMLElement | null) => void,
			...attributes,
			...listeners,
		},
		isDragging,
	}
}

/**
 * Make an edge zone a drop target. Returns props to spread on the zone element
 * + whether it's the active drop target (the pointer is over it).
 */
export function useEdgeDropZone(edge: DropEdge) {
	const { setNodeRef, isOver } = useDroppable({ id: `edge:${edge}`, data: { edge } })
	return {
		dropZoneProps: {
			ref: setNodeRef as unknown as (el: HTMLElement | null) => void,
		},
		isOver,
	}
}
