// Shared widget frame (docs/hud.md).
//
// Every HUD widget renders inside a `WidgetCard`: a card surface with a header
// row made of a drag handle, the widget title, an optional status chip, and an
// optional `actions` slot. The children slot holds the widget body.
//
// The card is the single styled unit reused both **in-panel** and (Phase 3)
// **on the viewport** as a moved-out copy. Two render modes:
//
//   - **panel mode** (default): full card chrome — header with a drag handle,
//     title, status chip, actions. The handle is a dnd-kit drag source
//     (`useWidgetDragHandle` with mode 'pop'); starting the drag tells the
//     store we're dragging this `widget` kind (closes the panel + surfaces the
//     viewport edge drop zones). When the kind is already popped, the panel
//     hides this card's body entirely — the widget is **moved** out, not
//     duplicated.
//   - **popped mode** (inside `PoppedContextProvider`): body-only — no header
//     chrome. The popped wrapper in `viewport-widgets-layer.tsx` provides the
//     title + a single re-dock drag handle (mode 'redock') and the close
//     button. This keeps exactly one handle per visible card.

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

	// In panel mode the widget is hidden entirely while its kind is moved out
	// onto the viewport (move, not duplicate — no empty slot with a handle).
	const isInPanel = !popped
	const kindPopped = isWidgetPopped(poppedList, widget)
	const hiddenInPanel = isInPanel && kindPopped

	if (popped) {
		// Body-only: the popped wrapper provides the title + handle + close.
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

	return (
		<div
			data-testid={testId}
			className={cn(
				'pointer-events-auto flex w-full flex-col gap-2 rounded-lg border border-border bg-card/80 p-3 backdrop-blur-sm',
				className,
			)}
		>
			<div className="flex items-center justify-between gap-2">
				<div className="flex min-w-0 items-center gap-1.5">
					<DragHandle widget={widget} title={title} />
					<span className="truncate font-semibold text-foreground text-sm">{title}</span>
				</div>
				<div className="flex items-center gap-1">
					{status != null && <div className="flex-none">{status}</div>}
					{actions}
				</div>
			</div>
			<div className={cn('flex flex-col gap-3', bodyClassName)}>{children}</div>
		</div>
	)
}

/** The panel-side drag handle. Uses dnd-kit's pointer-based drag so it works
 *  reliably in the browser and is drivable by Playwright's mouse API. */
function DragHandle({ widget, title }: { widget: WidgetId; title: string }) {
	const { dragHandleProps, isDragging } = useWidgetDragHandle(widget, 'pop')
	return (
		// biome-ignore lint/a11y/useAriaPropsSupportedByRole: drag handle is a static affordance; aria-label is the accessible name
		<span
			{...dragHandleProps}
			className={cn(
				'flex cursor-grab touch-none select-none text-muted-foreground/60 hover:text-muted-foreground active:cursor-grabbing',
				isDragging && 'opacity-40',
			)}
			aria-label={`Drag ${title} out of panel`}
			data-testid="widget-drag-handle"
			data-widget={widget}
		>
			<GripVertical className="size-4" aria-hidden="true" />
		</span>
	)
}
