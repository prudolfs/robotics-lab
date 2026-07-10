// Viewport widgets layer (docs/hud.md Phase 3).
//
// Renders the `popped[]` array as docked overlay cards on the main viewport,
// one per viewport edge. Each copy:
//   - is docked to its `edge` (top/right/bottom/left), clear of the app bars,
//   - has a header row with the title and a **close button** (the popped copy's
//     drag handle becomes a close button per the new Phase-3 model), clicking
//     it calls `undockWidget(widget)` and moves the widget back to its tab,
//   - also carries a small re-dock drag handle (dnd-kit mode 'redock') so the
//     user can drag it to another edge without first closing it,
//   - renders the widget body via the shared `renderWidget` registry, wrapped
//     in `PoppedContextProvider` so the inner `WidgetCard` is body-only (no
//     double chrome).
//
// The layer is `pointer-events-none` except for the popped cards themselves.

import { X } from 'lucide-react'
import { useWidgetDragHandle, WIDGET_TITLES } from '@/components/dnd-context'
import { Button } from '@/components/ui/button'
import { PoppedContextProvider } from '@/components/widgets/widget-card'
import { renderWidget, type WidgetRenderProps } from '@/components/widgets/widget-registry'
import { cn } from '@/lib/utils'
import type { SimulationControls } from '@/sim/use-simulation-loop'
import { type DropEdge, type PoppedWidget, useSimulatorStore } from '@/store'

const EDGE_CLASS: Record<DropEdge, string> = {
	top: 'top-14 inset-x-3 items-start',
	bottom: 'bottom-10 inset-x-3 items-end',
	left: 'left-3 top-16 bottom-12 items-start',
	right: 'right-3 top-16 bottom-12 items-end',
}

const WIDTH_CLASS: Record<DropEdge, string> = {
	top: 'max-w-md',
	bottom: 'max-w-md',
	left: 'max-w-xs',
	right: 'max-w-xs',
}

const SCROLL_CLASS: Record<DropEdge, string> = {
	top: 'max-h-[40vh] overflow-y-auto',
	bottom: 'max-h-[40vh] overflow-y-auto',
	left: 'max-h-full overflow-y-auto',
	right: 'max-h-full overflow-y-auto',
}

export interface ViewportWidgetsLayerProps extends WidgetRenderProps {
	controls: SimulationControls
	onReset: () => void
}

export function ViewportWidgetsLayer(props: ViewportWidgetsLayerProps) {
	const popped = useSimulatorStore((s) => s.popped)
	const draggingWidget = useSimulatorStore((s) => s.draggingWidget)

	// Hide the popped cards while dragging any widget (the drop zones take over).
	const visible = !draggingWidget

	if (!visible || popped.length === 0) return null

	return (
		<div className="pointer-events-none absolute inset-0 z-30">
			{popped.map((p) => (
				<PoppedCard key={p.widget} popped={p} renderProps={props} />
			))}
		</div>
	)
}

function PoppedCard({
	popped,
	renderProps,
}: {
	popped: PoppedWidget
	renderProps: WidgetRenderProps
}) {
	const undockWidget = useSimulatorStore((s) => s.undockWidget)
	const title = WIDGET_TITLES[popped.widget]
	const { dragHandleProps, isDragging } = useWidgetDragHandle(popped.widget, 'redock')

	return (
		<div
			data-testid={`popped-widget-${popped.widget}`}
			data-edge={popped.edge}
			className={cn(
				'pointer-events-auto absolute flex flex-col',
				EDGE_CLASS[popped.edge],
				WIDTH_CLASS[popped.edge],
			)}
		>
			<div className="flex w-full flex-col gap-2 rounded-lg border border-border bg-card/90 p-3 shadow-2xl backdrop-blur-md">
				<div className="flex items-center justify-between gap-2">
					<div className="flex min-w-0 items-center gap-1.5">
						{/* Re-dock drag handle (dnd-kit, mode 'redock'). */}
						{/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: drag handle is a static affordance; aria-label is the accessible name */}
						<span
							{...dragHandleProps}
							className={cn(
								'flex cursor-grab touch-none select-none text-muted-foreground/60 hover:text-muted-foreground active:cursor-grabbing',
								isDragging && 'opacity-40',
							)}
							aria-label={`Drag ${title} to re-dock`}
							data-testid={`popped-drag-handle-${popped.widget}`}
						>
							<span className="text-muted-foreground/60" aria-hidden="true">
								⠿
							</span>
						</span>
						<span className="truncate font-semibold text-foreground text-sm">{title}</span>
					</div>
					<Button
						variant="ghost"
						size="icon"
						className="size-6"
						onClick={() => undockWidget(popped.widget)}
						aria-label={`Close ${title} — return to panel`}
						data-testid={`popped-remove-${popped.widget}`}
					>
						<X className="size-4" />
					</Button>
				</div>
				<PoppedContextProvider value={true}>
					<div className={cn('flex flex-col gap-3', SCROLL_CLASS[popped.edge])}>
						{renderWidget(popped.widget, { ...renderProps, dockedOnViewport: true })}
					</div>
				</PoppedContextProvider>
			</div>
		</div>
	)
}
