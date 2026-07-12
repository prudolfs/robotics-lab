// Logs widget (Utils tab) — docs/hud.md Phase 5.
//
// A small ring-buffer logger feeds a scrollable mono box like the reference
// Utils tab's "System Logs" panel. The capture lives in `@/lib/logger`
// (`useLogger` auto-installs a `console.info/warn/error` patch on first call,
// so mounting this widget is enough — no `App.tsx` / loop wiring needed).
// The widget owns no simulation state: it only reads the log buffer and
// offers a Clear button.

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { WidgetCard } from '@/components/widgets/widget-card'
import { clearLogs, type LogLevel, useLogger } from '@/lib/logger'

const LEVEL_TONE: Record<LogLevel, string> = {
	info: 'text-muted-foreground',
	warn: 'text-amber-500',
	error: 'text-red-500',
}

const LEVEL_TAG: Record<LogLevel, string> = {
	info: 'INFO',
	warn: 'WARN',
	error: 'ERR ',
}

function stamp(time: number): string {
	const d = new Date(time)
	const pad = (n: number) => String(n).padStart(2, '0')
	return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function LogsWidget() {
	const logs = useLogger()
	const boxRef = useRef<HTMLDivElement | null>(null)
	// Track whether the user is scrolled up so we don't yank the view while
	// they're reading older lines.
	const [pinned, setPinned] = useState(true)

	const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
		const el = e.currentTarget
		const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 8
		setPinned(atBottom)
	}

	useEffect(() => {
		if (pinned && boxRef.current) {
			boxRef.current.scrollTop = boxRef.current.scrollHeight
		}
	})

	return (
		<WidgetCard
			title="System Logs"
			widget="utils.logs"
			bodyClassName="gap-2"
			actions={
				<Button
					variant="outline"
					size="xs"
					onClick={clearLogs}
					disabled={logs.length === 0}
					data-testid="logs-clear"
				>
					Clear
				</Button>
			}
		>
			<div
				ref={boxRef}
				onScroll={onScroll}
				data-testid="logs-view"
				className="max-h-40 overflow-y-auto rounded border border-border bg-background/40 p-2 font-mono text-[11px] leading-relaxed"
			>
				{logs.length === 0 ? (
					<span className="text-muted-foreground">No logs yet</span>
				) : (
					logs.map((entry) => (
						<div key={entry.id} className="flex gap-2 whitespace-pre-wrap break-words">
							<span className="select-none text-muted-foreground/60">
								{stamp(entry.time)} {LEVEL_TAG[entry.level]}
							</span>
							<span className={LEVEL_TONE[entry.level]}>{entry.text}</span>
						</div>
					))
				)}
			</div>
		</WidgetCard>
	)
}
