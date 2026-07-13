// Shared widget frame (docs/hud.md).
//
// Every HUD widget renders inside a `WidgetCard`. Its chrome depends on where
// the widget lives (Phase 4 — blend with the right panel per `.temp/right-panel/`):
//
//   - **panel mode** (default): the widget **blends into the right panel** — no
//     card surface of its own. A header row (drag handle + uppercase title +
//     optional status chip / actions) is underlined by a hairline `border-b`,
//     then the body sits below it. The panel is the only glass container, so
//     in-panel widgets are borderless `<section>`s (mirrors the `.temp/right-panel/`
//     mocks where every section sits inside the translucent `#right-panel`).
//   - **popped mode** (inside `PoppedContextProvider`): body-only — the popped
//     wrapper in `viewport-widgets-layer.tsx` owns the title + single re-dock
//     drag handle + close button, and draws its **own** card surface
//     (`rounded-lg border bg-card/80 ...`) because the widget is detached from
//     the panel and needs its own frame (mirrors the reference's elevated
//     popover cards).
//   - **ghost mode** (inside `GhostContextProvider`): body-only with no chrome
//     at all, used by `dnd-context.tsx`'s `DragOverlay`.
//
// The drag handle is a dnd-kit drag source (`useWidgetDragHandle` with mode
// 'pop'). When the kind is already popped, the panel hides this card entirely
// — the widget is **moved** out, not duplicated.

import { GripVertical } from 'lucide-react'
import type { ReactNode } from 'react'
import { createContext, useContext } from 'react'
import { useWidgetDragHandle } from '@/components/dnd-context'
import { cn } from '@/lib/utils'
import { isWidgetPopped, useSimulatorStore, type WidgetId } from '@/store'

/**
 * When rendering a popped copy, the viewport widgets layer sets this context so
 * `WidgetCard` renders body-only (its header chrome + drag handle are provided
 * by the popped wrapper, keeping a single handle + close button).
 */
const PoppedContext = createContext(false)
export const PoppedContextProvider = PoppedContext.Provider

/**
 * When rendering a drag-overlap ghost, `dnd-context.tsx` sets this context so
 * `WidgetCard` renders body-only with no card chrome — the `DragOverlay` owns
 * its own surface.
 */
const GhostContext = createContext(false)
export const GhostContextProvider = GhostContext.Provider

export function WidgetCard({
	title,
	status,
	actions,
	children,
	'data-testid': testId,
	className,
	bodyClassName,
	widget,
}: {
	/** Existing widget header text (kept byte-for-byte). */
	title: string
	/** Optional right-aligned status chip (e.g. nav/teleop status badge). */
	status?: ReactNode
	/** Optional header actions (e.g. the popped copy's close button). */
	actions?: ReactNode
	/** The existing widget body — controls only, no header row. */
	children: ReactNode
	/** Forwarded so tests can address a specific widget card. */
	'data-testid'?: string
	/** Extra classes on the card (rarely needed). */
	className?: string
	/** Extra classes on the body wrapper. */
	bodyClassName?: string
	/** Which widget kind this card represents (for the drag handle). */
	widget: WidgetId
}) {
	const poppedList = useSimulatorStore((s) => s.popped)
	const popped = useContext(PoppedContext)
	const ghost = useContext(GhostContext)

	// In panel mode the widget is hidden entirely while its kind is moved out
	// onto the viewport (move, not duplicate — no empty slot with a handle).
	const isInPanel = !popped && !ghost
	const kindPopped = isWidgetPopped(poppedList, widget)
	const hiddenInPanel = isInPanel && kindPopped

	if (popped || ghost) {
		// Body-only: the popped wrapper (or the drag ghost) provides title +
		// handle + close. The popped wrapper draws its own card surface; a
		// ghost is a bare body for the DragOverlay.
		return (
			<div
				data-testid={testId}
				className={cn('pointer-events-auto flex w-full flex-col gap-3', bodyClassName)}
			>
				{children}
			</div>
		)
	}

	if (hiddenInPanel) {
		// The widget lives on the viewport now — render nothing in the panel.
		// `hidden` keeps the DOM slot for the tab pane layout but is fully inert.
		return (
			<div
				data-testid={testId ? `${testId}-docked` : undefined}
				hidden
				aria-hidden="true"
				className="hidden"
			/>
		)
	}

	// Panel mode: the widget blends into the right panel — no card surface of
	// its own. A header row (handle + uppercase title + status/actions) is
	// underlined by a hairline `border-b`, then the body sits below it. The
	// panel is the only glass container (mirrors `.temp/right-panel/` mocks).
	return (
		<section data-testid={testId} className={cn('flex w-full flex-col gap-2 pb-1', className)}>
			<div className="flex items-center justify-between gap-2 border-border border-b pb-2">
				<div className="flex min-w-0 items-center gap-1.5">
					<DragHandle widget={widget} title={title} />
					<h3 className="truncate font-semibold text-foreground text-xs uppercase tracking-wider">
						{title}
					</h3>
				</div>
				<div className="flex items-center gap-1">
					{status != null && <div className="flex-none">{status}</div>}
					{actions}
				</div>
			</div>
			<div className={cn('flex flex-col gap-3 pt-1', bodyClassName)}>{children}</div>
		</section>
	)
}

/** The panel-side drag handle. Uses dnd-kit's pointer-based drag so it works
 *  reliably in the browser and is drivable by Playwright's mouse API. */
function DragHandle({ widget, title }: { widget: WidgetId; title: string }) {
	const { dragHandleProps, isDragging } = useWidgetDragHandle(widget, 'pop')
	return (
		<button
			type="button"
			{...dragHandleProps}
			tabIndex={0}
			className={cn(
				'flex cursor-grab touch-none select-none bg-transparent p-0 text-muted-foreground/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing',
				isDragging && 'opacity-40',
			)}
			aria-label={`Drag ${title} out of panel`}
			data-testid="widget-drag-handle"
			data-widget={widget}
		>
			<GripVertical className="size-3.5" aria-hidden="true" />
		</button>
	)
}
