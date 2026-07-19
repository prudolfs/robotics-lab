// Minimap live-feed widget (Map tab + dockable on viewport) — Phase 3.
//
// The occupancy minimap canvas is a live-feed widget with its own drag handle
// (`map.minimap`), gated by the `Mini` on/off toggle. With the "move, not
// duplicate" model there is ever only one rendered copy of this widget —
// panel or popped — and it owns the single live minimap canvas.
//
// The minimap canvas stays outside the main `<Canvas>` (it's a 2D HTML-canvas
// overlay, per the camera/minimap caveat); it is mounted here rather than in
// `App.tsx`.

import { OccupancyMinimap } from '@robotics-lab/rendering'
import { Button } from '@/components/ui/button'
import { WidgetCard } from '@/components/widgets/widget-card'
import { useSimulatorStore, type WidgetId } from '@/store'

const WIDGET: WidgetId = 'map.minimap'

export type MinimapWidgetProps = {
	/** True when this is the popped copy docked on the viewport. (Unused now
	 *  under the move model — but kept for registry API symmetry.) */
	dockedOnViewport?: boolean
	/** Square canvas px size. */
	size?: number
}

export function MinimapWidget({ size = 160 }: MinimapWidgetProps) {
	const showMinimap = useSimulatorStore((s) => s.showMinimap)
	const toggleMinimap = useSimulatorStore((s) => s.toggleMinimap)
	const grid = useSimulatorStore((s) => s.grid)
	const world = useSimulatorStore((s) => s.world)
	const robot = useSimulatorStore((s) => s.robot)
	const scan = useSimulatorStore((s) => s.scan)

	return (
		<WidgetCard title="Minimap" widget={WIDGET} data-testid="minimap-widget" bodyClassName="gap-2">
			<div className="flex items-center justify-between">
				<span className="text-muted-foreground text-xs">Corner minimap</span>
				<Button
					variant={showMinimap ? 'default' : 'outline'}
					size="xs"
					onClick={toggleMinimap}
					data-testid="minimap-toggle"
				>
					Mini
				</Button>
			</div>

			{!showMinimap ? (
				<span className="font-mono text-[10px] text-muted-foreground">
					minimap off — press Mini to enable
				</span>
			) : (
				<div data-testid="occupancy-minimap" className="flex flex-col items-center gap-1">
					<div className="rounded-md border border-border bg-card/60 p-1">
						<OccupancyMinimap
							grid={grid}
							world={world}
							pose={robot.pose}
							scan={scan}
							size={size}
							className="block rounded"
						/>
					</div>
				</div>
			)}
		</WidgetCard>
	)
}
