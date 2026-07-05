// Map HUD: occupancy grid controls (milestone 6).
//
// Owns no simulation state — only reads/writes Zustand app state. The
// occupancy grid itself is observed in the store (the sim loop integrates the
// latest scan into it each fixed step). This HUD exposes the toggles that
// gate the in-scene floor overlay, the minimap, and a manual "clear map"
// button.

import { Button } from '@/components/ui/button'
import { useSimulatorStore } from '@/store'

export function MapHud() {
	const showOccupancy = useSimulatorStore((s) => s.showOccupancy)
	const toggleOccupancy = useSimulatorStore((s) => s.toggleOccupancy)
	const showMinimap = useSimulatorStore((s) => s.showMinimap)
	const toggleMinimap = useSimulatorStore((s) => s.toggleMinimap)
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
		<div
			className="pointer-events-auto absolute right-4 flex w-56 -translate-y-2 flex-col gap-2 rounded-lg border border-border bg-card/80 p-3 backdrop-blur-sm"
			style={{ top: 'calc(50% + 0rem)', transform: 'translateY(-50%)' }}
		>
			<div className="flex items-center justify-between">
				<span className="font-semibold text-foreground text-sm">Map</span>
				<div className="flex gap-1">
					<ToggleButton label="Grid" active={showOccupancy} onClick={toggleOccupancy} />
					<ToggleButton label="Mini" active={showMinimap} onClick={toggleMinimap} />
				</div>
			</div>
			<div className="flex flex-col gap-1 font-mono text-[11px] text-muted-foreground">
				<span>unknown {fmtPct(grid, unknown)}</span>
				<span className="text-green-400">free {fmtPct(grid, free)}</span>
				<span className="text-red-400">occupied {fmtPct(grid, occupied)}</span>
			</div>
			<Button
				variant="outline"
				size="xs"
				onClick={clearMap}
				className="pointer-events-auto"
				disabled={!grid}
			>
				Clear map
			</Button>
		</div>
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
}: {
	label: string
	active: boolean
	onClick: () => void
}) {
	return (
		<Button variant={active ? 'default' : 'outline'} size="xs" onClick={onClick}>
			{label}
		</Button>
	)
}
