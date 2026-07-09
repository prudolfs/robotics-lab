// Minimap widget (Map tab) — Phase 2 of docs/hud.md.
//
// Owns only the `Mini` (showMinimap) toggle from the old `MapHud`. The
// occupancy minimap canvas itself (`OccupancyMinimap`) stays a floating
// element mounted in `App.tsx` (per the camera/minimap caveat in the plan:
// those DOM elements must sit outside `<Canvas>`), so this widget is
// controls-only — flipping the toggle gates the floater in `App.tsx`.

import { Button } from '@/components/ui/button'
import { WidgetCard } from '@/components/widgets/widget-card'
import { useSimulatorStore } from '@/store'

export function MinimapWidget() {
	const showMinimap = useSimulatorStore((s) => s.showMinimap)
	const toggleMinimap = useSimulatorStore((s) => s.toggleMinimap)

	return (
		<WidgetCard title="Minimap" bodyClassName="gap-2">
			<div className="flex items-center justify-between">
				<span className="text-muted-foreground text-xs">Corner minimap</span>
				<ToggleButton
					data-testid="minimap-toggle"
					label="Mini"
					active={showMinimap}
					onClick={toggleMinimap}
				/>
			</div>
		</WidgetCard>
	)
}

function ToggleButton({
	label,
	active,
	onClick,
	...props
}: {
	label: string
	active: boolean
	onClick: () => void
	[key: string]: unknown
}) {
	return (
		<Button variant={active ? 'default' : 'outline'} size="xs" onClick={onClick} {...props}>
			{label}
		</Button>
	)
}
