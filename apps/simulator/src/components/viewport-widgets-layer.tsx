// Viewport widgets layer (docs/hud.md Phase 3 + Phase 4c + Phase 4 polish).
//
// Renders the `popped[]` array as docked overlay cards on the main viewport.
// Phase 4c changed the layout model: instead of anchoring each card to the
// same edge coordinates (which stacked multiple `top` widgets on identical
// pixels), one **per-edge strip** element holds all widgets dropped on that
// edge — laid out in normal document flow with `gap-2`, so widgets on the
// same edge never overlap.
//
// Phase 4 look-and-feel pass — the layout direction is edge-aware:
//   - `top` / `bottom` edges lay widgets out **horizontally** (`flex-row`),
//     so several widgets dropped on `top` sit side-by-side along the edge
//     (the user's explicit ask — Phase 4c originally stacked them vertically).
//     The strip scrolls on **x** when the row overflows (`overflow-x-auto`).
//     To keep corner widgets from colliding, the strip's height is capped
//     (`max-h-[40vh]`) and each card's **body** scrolls internally
//     (`overflow-y-auto`) when the widget is taller than the cap — so a tall
//     lidar card docked at `top` shows its header + a scrollable slider list
//     rather than pushing the strip down into the side strips.
//   - `left` / `right` edges keep the **vertical** column (`flex-col`) — the
//     side span is tall and narrow, so stacking vertically uses the long axis.
//     The strip scrolls on **y** when the stack overflows (`overflow-y-auto`).
//
// Each popped card:
//   - is a child of its edge strip (absolute-positioned to the edge),
//   - has a header row with a re-dock drag handle (dnd-kit mode 'redock') so
//     the user can drag it to another edge without first closing it,
//   - carries a **close (X) button** that calls `undockWidget(widget)` and
//     moves the widget back to its tab in the right panel,
//   - renders the widget body via the shared `renderWidget` registry, wrapped
//     in `PoppedContextProvider` so the inner `WidgetCard` is body-only,
//   - draws its **own** glass card surface (`rounded-lg border bg-card/80 ...`)
//     because it is detached from the right panel — in-panel widgets are
//     borderless and blend into the panel, but a popped widget floats over the
//     viewport and needs its own frame (mirrors `.temp/right-panel/` mocks).
//
// Live-feed widgets (`sensors.camera.feed`, `map.minimap`) keep their canvas
// fixed (`flex-none` + the canvas's own height) so the scroll container
// reserves the right space when the strip overflows.
//
// The layer is `pointer-events-none` except for the strips + cards themselves.
// The strips are hidden while a drag is in progress (the drop zones take
// over). When the right panel is open, the strips clear the panel footprint so
// the panel's tabs stay clickable (see `PANEL_CLEAR_CLASS`).

import { X } from 'lucide-react'
import { useWidgetDragHandle, WIDGET_TITLES } from '@/components/dnd-context'
import { Button } from '@/components/ui/button'
import { PoppedContextProvider } from '@/components/widgets/widget-card'
import { renderWidget, type WidgetRenderProps } from '@/components/widgets/widget-registry'
import { cn } from '@/lib/utils'
import type { SimulationControls } from '@/sim/use-simulation-loop'
import { type DropEdge, type PoppedWidget, useSimulatorStore } from '@/store'

/**
 * Tailwind classes anchoring each edge strip. `top`/`bottom` are **horizontal**
 * (`flex-row`, scrolling on x) so several widgets sit side-by-side along the
 * edge; their height is capped (`max-h-[40vh]`) so corner widgets never collide.
 * `left`/`right` stay **vertical** (`flex-col`, scrolling on y) because the
 * side span is tall and narrow.
 */
const STRIP_BASE: Record<DropEdge, string> = {
	top: 'absolute top-14 inset-x-3 flex-row items-start gap-2 max-h-[40vh] max-w-none overflow-x-auto overflow-y-hidden',
	bottom:
		'absolute bottom-10 inset-x-3 flex-row items-start gap-2 max-h-[40vh] max-w-none overflow-x-auto overflow-y-hidden',
	left: 'absolute left-3 flex-col items-start gap-2 max-w-xs overflow-y-auto',
	right: 'absolute right-3 flex-col items-end gap-2 max-w-xs overflow-y-auto',
}

/** Vertical clearance applied to side strips when a horizontal strip is
 *  populated. The top strip occupies `top-14` (56px) + up to `max-h-[40vh]`
 *  (288px at a 720 viewport) → bottom edge as deep as y=344. Side strips must
 *  start at or below that, so we anchor them at `top-[22rem]` (352px — 344 +
 *  8px gap). Symmetric for the bottom strip (`bottom-[22rem]`). These are
 *  static utilities Tailwind v4 emits. */
const STRIP_CLEAR_TOP = 'top-[22rem]'
const STRIP_CLEAR_BOTTOM = 'bottom-[22rem]'

/** Side-strip default top when no `top` strip is present (clears top app bar). */
const STRIP_DEFAULT_TOP = 'top-16'
/** Side-strip default bottom when no `bottom` strip is present (clears footer). */
const STRIP_DEFAULT_BOTTOM = 'bottom-12'

/** Extra classes for the card **body** wrapper that make tall content scroll
 *  internally when the card lives in a height-capped horizontal strip. Without
 *  this a tall lidar card docked at `top` would push the strip down past the
 *  side-strip clearance and the corner widgets would collide. In side strips
 *  (left/right) the strip's own `overflow-y-auto` handles overflow, so bodies
 *  are unconstrained. */
const BODY_SCROLL_CLASS: Record<DropEdge, string> = {
	top: 'edge-scroll max-h-[36vh] overflow-y-auto',
	bottom: 'edge-scroll max-h-[36vh] overflow-y-auto',
	left: '',
	right: '',
}

/** Align cards toward the edge they were dropped on within the strip column. */
const ITEMS_CLASS: Record<DropEdge, string> = {
	top: 'items-start',
	bottom: 'items-start',
	left: 'items-start',
	right: 'items-end',
}

/** Extra insets applied while the right panel is open so strips clear the
 *  panel footprint (`w-[20rem]` + `right-4` gap ≈ 21rem). Keeps the panel's
 *  tabs clickable. The `right` strip shifts to the left of the panel.
 *  `left` needs no shift because the panel is on the right. */
const PANEL_CLEAR_CLASS: Record<DropEdge, string> = {
	top: 'right-[21rem]',
	bottom: 'right-[21rem]',
	left: '',
	right: 'right-[21rem]',
}

/** The prioritized order in which edges appear in the overlay's DOM. */
const EDGE_ORDER: DropEdge[] = ['top', 'right', 'bottom', 'left']

export interface ViewportWidgetsLayerProps extends WidgetRenderProps {
	controls: SimulationControls
	onReset: () => void
}

export function ViewportWidgetsLayer(props: ViewportWidgetsLayerProps) {
	const popped = useSimulatorStore((s) => s.popped)
	const draggingWidget = useSimulatorStore((s) => s.draggingWidget)
	const panelOpen = useSimulatorStore((s) => s.panelOpen)

	// Hide the popped cards while dragging any widget (the drop zones take over).
	const visible = !draggingWidget

	if (!visible || popped.length === 0) return null

	return (
		<div className="pointer-events-none absolute inset-0 z-30">
			{EDGE_ORDER.map((edge) => (
				<EdgeStrip
					key={edge}
					edge={edge}
					popped={popped}
					renderProps={props}
					panelOpen={panelOpen}
				/>
			))}
		</div>
	)
}

/** A flex container anchored to one viewport edge; maps its edge's popped
 *  widgets to laid-out popped cards. `top`/`bottom` lay cards out horizontally
 *  (`flex-row`); `left`/`right` stack them vertically (`flex-col`). Empty edges
 *  render nothing (so the remaining strips take the full span when their peer
 *  is unpopulated). */
function EdgeStrip({
	edge,
	popped,
	renderProps,
	panelOpen,
}: {
	edge: DropEdge
	popped: PoppedWidget[]
	renderProps: WidgetRenderProps
	panelOpen: boolean
}) {
	const onEdge = popped.filter((p) => p.edge === edge)
	if (onEdge.length === 0) return null

	// Which other edges are populated? Side strips clear the horizontal
	// strips that have cards so corner cards never collide.
	const hasTop = popped.some((p) => p.edge === 'top')
	const hasBottom = popped.some((p) => p.edge === 'bottom')

	// Build the strip's class list: base classes; for the side edges compose
	// the top/bottom bound that clears the populated horizontal strip (or its
	// default). Dynamic class assembly is fine here — each class token is a
	// static string Tailwind v4 recognises individually.
	const sideTop = hasTop ? STRIP_CLEAR_TOP : STRIP_DEFAULT_TOP
	const sideBottom = hasBottom ? STRIP_CLEAR_BOTTOM : STRIP_DEFAULT_BOTTOM
	const stripClass =
		edge === 'left' || edge === 'right'
			? `${STRIP_BASE[edge]} ${sideTop} ${sideBottom}`
			: STRIP_BASE[edge]

	return (
		<div
			className={cn(
				'edge-scroll pointer-events-auto z-30 flex gap-2',
				stripClass,
				panelOpen && PANEL_CLEAR_CLASS[edge],
			)}
		>
			{onEdge.map((p) => (
				<PoppedCard key={p.widget} popped={p} renderProps={renderProps} />
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
			// `flex-none` keeps the card from shrinking in the strip so laid-out
			// cards each take their natural size and the strip can scroll.
			className={cn('pointer-events-auto flex flex-none flex-col', ITEMS_CLASS[popped.edge])}
		>
			{/* The popped card draws its **own** glass surface — it is detached
			    from the right panel (where widgets are borderless sections), so
			    it needs its own frame over the viewport. `max-h-full` keeps the
			    card inside the strip's `max-h-[40vh]` cap so the strip's
			    `overflow-y-hidden` never visually clips the frame. */}
			<div className="flex max-h-full w-full flex-col gap-2 overflow-hidden rounded-lg border border-border bg-card/80 p-3 shadow-2xl backdrop-blur-md">
				<div className="flex items-center justify-between gap-2 border-border border-b pb-2">
					<div className="flex min-w-0 items-center gap-1.5">
						<button
							type="button"
							{...dragHandleProps}
							tabIndex={0}
							className={cn(
								'flex cursor-grab touch-none select-none bg-transparent p-0 text-muted-foreground/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing',
								isDragging && 'opacity-40',
							)}
							aria-label={`Drag ${title} to re-dock`}
							data-testid={`popped-drag-handle-${popped.widget}`}
						>
							<span className="text-muted-foreground/60" aria-hidden="true">
								⠿
							</span>
						</button>
						<h3 className="truncate font-semibold text-foreground text-xs uppercase tracking-wider">
							{title}
						</h3>
					</div>
					<Button
						variant="ghost"
						size="icon"
						className="size-6"
						onClick={() => undockWidget(popped.widget)}
						aria-label={`Close ${title} — return to panel`}
						data-testid={`popped-remove-${popped.widget}`}
					>
						<X className="size-3.5" />
					</Button>
				</div>
				<PoppedContextProvider value={true}>
					{/* The body wrapper: `flex-none` keeps the live-feed canvas's
					    fixed height from stretching; the edge-specific
					    `BODY_SCROLL_CLASS` makes tall content scroll inside a
					    height-capped horizontal (top/bottom) strip rather than
					    overflowing it. Side strips leave the body unconstrained
					    (their own `overflow-y-auto` handles the scroll). */}
					<div
						className={cn(
							'flex w-full flex-none flex-col gap-3',
							BODY_SCROLL_CLASS[popped.edge],
						)}
					>
						{renderWidget(popped.widget, { ...renderProps, dockedOnViewport: true })}
					</div>
				</PoppedContextProvider>
			</div>
		</div>
	)
}
