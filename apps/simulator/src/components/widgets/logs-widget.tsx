// Logs widget (Utils tab) — Phase 2 stub (see docs/hud.md Phase 5).
//
// The reference Utils tab shows a "System Logs" panel. There is no logger
// stream yet, so this is a deliberately small stub that renders the shell only
// — a scrollable mono box with a placeholder line. Phase 5 wires a real ring
// buffer (either a tiny `useLogger` hook capturing console lines or a deferred
// "No logs yet"); the card shape is locked here so the Utils tab already reads
// as complete.

import { WidgetCard } from '@/components/widgets/widget-card'

export function LogsWidget() {
	return (
		<WidgetCard title="System Logs" widget="utils.logs" bodyClassName="gap-2">
			<div className="max-h-40 overflow-y-auto rounded border border-border bg-background/40 p-2 font-mono text-[11px] text-muted-foreground">
				No logs yet
			</div>
		</WidgetCard>
	)
}
