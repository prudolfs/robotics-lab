// Statistics widget (Inspect tab) — docs/simulator.md milestone 14.
//
// Simulation-wide accounting: how long the run has been going, how far the
// robot has travelled, how much of the world is mapped, how many goals are
// queued and how complete a coverage run is. All values are derived from
// already-observed store state (sim time / step count / robot pose / grid /
// goals / coverage flags / world) so this card owns no simulation state.
//
// Distance travelled is approximated from the start (the spawn pose). The
// spawn lives in the store so we can read it without touching the loop.

import { WidgetCard } from '@/components/widgets/widget-card'
import { useSimulatorStore, type WidgetId } from '@/store'

const WIDGET: WidgetId = 'inspect.stats'
const fmt = (n: number) => n.toFixed(2)
const fmtTime = (sec: number) => {
	const s = Math.max(0, Math.floor(sec))
	const hh = Math.floor(s / 3600)
	const mm = Math.floor((s % 3600) / 60)
	const ss = s % 60
	const pad = (n: number) => String(n).padStart(2, '0')
	return `${pad(hh)}:${pad(mm)}:${pad(ss)}`
}

export function StatisticsWidget() {
	const simTime = useSimulatorStore((s) => s.simTime)
	const robot = useSimulatorStore((s) => s.robot)
	const spawnPose = useSimulatorStore((s) => s.spawnPose)
	const goals = useSimulatorStore((s) => s.goals)
	const path = useSimulatorStore((s) => s.path)
	const autonomous = useSimulatorStore((s) => s.autonomous)
	const coverageMode = useSimulatorStore((s) => s.coverageMode)
	const coverageComplete = useSimulatorStore((s) => s.coverageComplete)
	const navStatus = useSimulatorStore((s) => s.navStatus)
	const grid = useSimulatorStore((s) => s.grid)
	const world = useSimulatorStore((s) => s.world)

	const distance = Math.hypot(robot.pose.x - spawnPose.x, robot.pose.y - spawnPose.y)

	// Occupancy breakdown (mirrors the Map controls card's maths).
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
	const totalCells = grid ? grid.cells.length : 0
	const exploredPct = totalCells > 0 ? ((free + occupied) / totalCells) * 100 : 0

	return (
		<WidgetCard title="Statistics" widget={WIDGET} data-testid="statistics" bodyClassName="gap-2">
			<SectionLabel>Run</SectionLabel>
			<Row label="sim time" value={fmtTime(simTime)} />
			<Row
				label="state"
				value={!autonomous && !coverageMode ? 'manual' : coverageMode ? 'coverage' : 'auto'}
			/>
			<Row label="nav status" value={navStatus} />

			<SectionLabel>Motion</SectionLabel>
			<Row label="distance from spawn" value={`${fmt(distance)} m`} />

			<SectionLabel>Navigation</SectionLabel>
			<Row label="queued goals" value={`${goals.length}`} />
			<Row label="path waypoints" value={`${path.length}`} />

			<SectionLabel>Coverage</SectionLabel>
			<Row label="mode" value={coverageMode ? 'running' : coverageComplete ? 'complete' : 'off'} />

			<SectionLabel>Map</SectionLabel>
			<Row label="explored" value={`${fmt(exploredPct)}%`} />
			<Row label="free cells" value={`${free}`} />
			<Row label="occupied cells" value={`${occupied}`} />
			<Row label="unknown cells" value={`${unknown}`} />

			<SectionLabel>World</SectionLabel>
			<Row label="size" value={`${fmt(world.width)} × ${fmt(world.depth)} m`} />
			<Row label="walls" value={`${world.walls.length}`} />
			<Row label="boxes" value={`${world.boxes.length}`} />
			<Row label="cylinders" value={`${world.cylinders.length}`} />
		</WidgetCard>
	)
}

function SectionLabel({ children }: { children: React.ReactNode }) {
	return (
		<span className="mt-1 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
			{children}
		</span>
	)
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between gap-2">
			<span className="text-muted-foreground text-xs">{label}</span>
			<span className="font-mono text-foreground text-xs">{value}</span>
		</div>
	)
}
