// Map controls widget (Map tab) — docs/hud.md.
//
// The occupancy-grid controls: the `Grid` (showOccupancy) toggle, the free /
// occupied / unknown stats, and the `Clear map` button. All text / formatters
// are kept byte-for-byte from the original HUD. The `Mini` (showMinimap) toggle
// lives in the separate `MinimapWidget`.

import { Button } from '@/components/ui/button'
import { WidgetCard } from '@/components/widgets/widget-card'
import { useSimulatorStore } from '@/store'

export function MapControlsWidget() {
	const showOccupancy = useSimulatorStore((s) => s.showOccupancy)
	const toggleOccupancy = useSimulatorStore((s) => s.toggleOccupancy)
	const clearMap = useSimulatorStore((s) => s.clearMap)
	const grid = useSimulatorStore((s) => s.grid)

	// Crude stats so the HUD reads as a live map inspector.
	let free = 0
	let occupied = 0
	let unknown = 0
	if (grid) {
		for (let i = 0; i < grid.cells.length; i++) {
			const v = grid.cells[i]
			if (Math.abs(v) < 1e-6) unknown++
			else if (v > 0) occupied++
			else free++
		}
	}

	return (
		<WidgetCard title="Map" widget="map.controls" bodyClassName="gap-2">
			<div className="flex items-center justify-end">
				<ToggleButton
					data-testid="occupancy-grid-toggle"
					label="Grid"
					active={showOccupancy}
					onClick={toggleOccupancy}
				/>
			</div>
			<div className="flex flex-col gap-1 font-mono text-[11px] text-muted-foreground">
				<span>unknown {fmtPct(grid, unknown)}</span>
				<span className="text-green-400">free {fmtPct(grid, free)}</span>
				<span className="text-red-400">occupied {fmtPct(grid, occupied)}</span>
			</div>
			<Button
				data-testid="clear-map-button"
				variant="outline"
				size="xs"
				onClick={clearMap}
				disabled={!grid}
			>
				Clear map
			</Button>
		</WidgetCard>
	)
}

function fmtPct(grid: { cells: Float32Array } | null, count: number): string {
	if (!grid) return '0%'
	return `${((count / grid.cells.length) * 100).toFixed(1)}%`
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
