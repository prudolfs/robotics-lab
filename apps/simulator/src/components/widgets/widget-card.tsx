// Shared widget frame (Phase 2 of docs/hud.md).
//
// Every HUD widget renders inside a `WidgetCard`: a card surface with a header
// row made of a drag-handle placeholder (a non-interactive `GripVertical` lucide
// icon — wired up to real drag-out in Phase 3), the widget title, and an
// optional status chip on the right. The children slot holds the existing
// widget body, so every label / slider / button stays byte-for-byte.
//
// The card is the single styled unit reused both in-panel and (from Phase 3
// onward) on the viewport as a popped-out copy. In Phase 2 the handle is a
// decorative placeholder.

import { GripVertical } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function WidgetCard({
	title,
	status,
	children,
	'data-testid': testId,
	className,
	bodyClassName,
}: {
	/** Existing widget header text (kept byte-for-byte). */
	title: string
	/** Optional right-aligned status chip (e.g. nav/teleop status badge). */
	status?: ReactNode
	/** The existing widget body — controls only, no header row. */
	children: ReactNode
	/** Forwarded so tests can address a specific widget card. */
	'data-testid'?: string
	/** Extra classes on the card (rarely needed). */
	className?: string
	/** Extra classes on the body wrapper. */
	bodyClassName?: string
}) {
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
					{/* Drag handle placeholder — non-interactive in Phase 2. Phase 3
					    makes this a real HTML5 drag source that pops a duplicate onto
					    the viewport. */}
					<GripVertical
						className="size-4 text-muted-foreground/50"
						aria-hidden="true"
						data-testid="widget-drag-handle"
					/>
					<span className="truncate font-semibold text-foreground text-sm">{title}</span>
				</div>
				{status != null && <div className="flex-none">{status}</div>}
			</div>
			<div className={cn('flex flex-col gap-3', bodyClassName)}>{children}</div>
		</div>
	)
}
