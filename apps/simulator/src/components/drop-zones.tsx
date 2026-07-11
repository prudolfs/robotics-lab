// Viewport edge drop zones (docs/hud.md Phase 3).
//
// When a widget handle drag starts (dnd-kit), the right panel closes and these
// four edge drop zones overlay the viewport (`top` / `right` / `bottom` /
// `left`). The simulation centre is intentionally **not** a drop target —
// widgets dock to a viewport edge, not over the robot. The zones are dnd-kit
// droppables (`useEdgeDropZone`); the one under the pointer highlights. The
// sim canvas behind is dimmed while the overlay is up.

import type { DragEndEvent } from '@dnd-kit/core'
import { useEdgeDropZone } from '@/components/dnd-context'
import { cn } from '@/lib/utils'
import { type DropEdge, useSimulatorStore } from '@/store'

const EDGES: DropEdge[] = ['top', 'right', 'bottom', 'left']

export function DropZones() {
	const draggingWidget = useSimulatorStore((s) => s.draggingWidget)
	if (!draggingWidget) return null

	return (
		<section
			data-testid="drop-zones"
			className={cn(
				// z-30 places the zones above the right panel (z-20) so the right
				// edge band is reachable even while the panel stays open (Phase 4).
				'pointer-events-auto absolute inset-0 z-30 transition-opacity duration-200 motion-reduce:transition-none',
				'bg-background/50 backdrop-blur-[1px] motion-reduce:backdrop-blur-none',
			)}
			aria-label="Drop widget on a viewport edge"
		>
			{EDGES.map((edge) => (
				<EdgeZone key={edge} edge={edge} />
			))}
			{/* Hint in the dead-centre (non-drop) area. */}
			<div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-card/80 px-3 py-1 font-mono text-[10px] text-muted-foreground">
				drop on a viewport edge to dock
			</div>
		</section>
	)
}

/** A single edge band. Visually a thick pill along the edge (not a full tile —
 *  the centre stays open). Active band gets the primary glow. */
function EdgeZone({ edge }: { edge: DropEdge }) {
	const { dropZoneProps, isOver } = useEdgeDropZone(edge)

	const pos =
		edge === 'top'
			? 'inset-x-4 top-2 h-24'
			: edge === 'bottom'
				? 'inset-x-4 bottom-2 h-24'
				: edge === 'left'
					? 'inset-y-4 left-2 w-24'
					: 'inset-y-4 right-2 w-24'
	const labelCenter =
		edge === 'top'
			? 'items-center justify-start pl-3'
			: edge === 'bottom'
				? 'items-center justify-end pr-3'
				: edge === 'left'
					? 'items-start justify-center pt-3'
					: 'items-end justify-center pb-3'
	const labelMap: Record<DropEdge, string> = {
		top: 'Top',
		bottom: 'Bottom',
		left: 'Left',
		right: 'Right',
	}

	return (
		<div
			{...dropZoneProps}
			data-testid={`drop-zone-${edge}`}
			data-edge={edge}
			data-over={isOver}
			className={cn(
				'absolute flex border-2 border-dashed transition-colors duration-150',
				pos,
				labelCenter,
				isOver
					? 'border-primary bg-primary/20 shadow-[0_0_20px_var(--primary)]'
					: 'border-primary/30 bg-primary/5',
			)}
		>
			<span
				className={cn(
					'font-semibold text-[10px] uppercase tracking-wider',
					isOver ? 'text-primary' : 'text-muted-foreground',
				)}
			>
				{labelMap[edge]}
			</span>
		</div>
	)
}

/** Type re-export so App-level onDragEnd can read the edge cleanly. */
export type { DragEndEvent }
