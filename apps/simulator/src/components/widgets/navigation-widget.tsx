// Navigation widget (Nav tab) — docs/hud.md.
//
// The click-to-goal / autonomy / coverage / planner controls. All text,
// labels, button wording and testids are kept byte-for-byte from the original
// HUD; the `nav-status` badge is passed to `WidgetCard` as the status chip
// (was the top-right badge in the old HUD). The absolute positioning is gone —
// it is now a normal-flow card in the Nav tab.

import type { NavStatus } from '@robotics-lab/navigation'
import { Button } from '@/components/ui/button'
import { WidgetCard } from '@/components/widgets/widget-card'
import type { SimulationControls } from '@/sim/use-simulation-loop'
import { useSimulatorStore } from '@/store'

const fmt = (n: number) => n.toFixed(2)

export function NavigationWidget({ controls }: { controls: SimulationControls }) {
	const goals = useSimulatorStore((s) => s.goals)
	const autonomous = useSimulatorStore((s) => s.autonomous)
	const navStatus = useSimulatorStore((s) => s.navStatus)
	const robot = useSimulatorStore((s) => s.robot)
	const planStatus = useSimulatorStore((s) => s.planStatus)
	const running = useSimulatorStore((s) => s.running)
	const setAutonomous = useSimulatorStore((s) => s.setAutonomous)
	const clearGoals = useSimulatorStore((s) => s.clearGoals)
	const planner = useSimulatorStore((s) => s.planner)
	const setPlanner = useSimulatorStore((s) => s.setPlanner)
	const showPath = useSimulatorStore((s) => s.showPath)
	const togglePath = useSimulatorStore((s) => s.togglePath)
	const path = useSimulatorStore((s) => s.path)
	const coverageMode = useSimulatorStore((s) => s.coverageMode)
	const coverageComplete = useSimulatorStore((s) => s.coverageComplete)

	const active = goals[0]
	const queueLen = goals.length
	const distance = active ? Math.hypot(active.x - robot.pose.x, active.y - robot.pose.y) : null

	return (
		<WidgetCard
			title="Navigation"
			widget="nav.navigation"
			status={<StatusBadge status={navStatus} autonomous={autonomous} />}
		>
			<div className="flex items-center gap-2">
				<Button
					data-testid="autonomous-toggle"
					variant={autonomous ? 'default' : 'outline'}
					size="xs"
					onClick={() => setAutonomous(!autonomous)}
					disabled={queueLen === 0 && !autonomous}
				>
					{autonomous ? 'Auto: ON' : 'Auto: OFF'}
				</Button>
				<Button
					data-testid="clear-goals-button"
					variant="outline"
					size="xs"
					onClick={clearGoals}
					disabled={queueLen === 0}
				>
					Clear goals
				</Button>
				{autonomous && (
					<Button variant="destructive" size="xs" onClick={controls.emergencyStop}>
						Stop
					</Button>
				)}
			</div>

			<div className="grid grid-cols-2 gap-x-3 gap-y-1">
				<span className="text-muted-foreground text-xs">Active goal</span>
				<span data-testid="active-goal" className="text-right font-mono text-foreground text-xs">
					{active ? `(${fmt(active.x)}, ${fmt(active.y)})` : '—'}
				</span>
				<span className="text-muted-foreground text-xs">Distance</span>
				<span data-testid="distance" className="text-right font-mono text-foreground text-xs">
					{distance != null ? `${fmt(distance)} m` : '—'}
				</span>
				<span className="text-muted-foreground text-xs">Queued</span>
				<span data-testid="goal-count" className="text-right font-mono text-foreground text-xs">
					{queueLen}
				</span>
			</div>

			<div
				data-testid="navigation-plan"
				className="rounded-md border border-border bg-muted/40 p-2.5 text-[10px] leading-5"
				aria-live="polite"
			>
				<strong className="block font-medium text-primary">
					{!autonomous
						? 'Manual control'
						: !running
							? 'Navigation paused'
							: navStatus === 'blocked'
								? 'Stopped: no safe route'
								: `${planner.algorithm === 'dijkstra' ? 'Dijkstra' : 'A*'} ${coverageMode ? 'coverage route' : 'route following'}`}
				</strong>
				<span className="text-muted-foreground">
					{navStatus === 'blocked'
						? planStatus === 'invalid_goal'
							? 'Choose a goal farther from obstacles and walls.'
							: 'Destination kept. Replanning; choose another goal or edit the map.'
						: 'Plans on the loaded map with clearance for the entire robot. Lidar builds a separate observed map.'}
				</span>
				{autonomous && path[0] && (
					<span data-testid="navigation-target" className="block text-foreground">
						Next turn: ({fmt(path[0].x)}, {fmt(path[0].y)})
					</span>
				)}
				<span className="block text-muted-foreground">
					Violet: active route · mint ring: next waypoint · red ring: destination
				</span>
			</div>

			<span className="text-[10px] text-muted-foreground">
				click the floor to set a goal · shift-click to queue waypoints
			</span>

			{/* Coverage controls (milestone 9) */}
			<div className="flex items-center justify-between gap-2">
				<span className="font-semibold text-foreground text-xs">Coverage</span>
				<div className="flex items-center gap-1">
					{coverageMode && !coverageComplete && (
						<span className="text-amber-500 text-xs">
							{navStatus === 'blocked'
								? 'Blocked'
								: autonomous && running
									? 'Running...'
									: 'Paused'}
						</span>
					)}
					{coverageComplete && <span className="text-emerald-500 text-xs">Complete</span>}
				</div>
			</div>
			<div className="flex items-center gap-2">
				<Button
					data-testid="coverage-start"
					variant={coverageMode ? 'default' : 'outline'}
					size="xs"
					onClick={controls.startCoverage}
					disabled={coverageMode && !coverageComplete}
				>
					Clean Room
				</Button>
				<Button
					data-testid="coverage-cancel"
					variant="outline"
					size="xs"
					onClick={controls.cancelCoverage}
					disabled={!coverageMode}
				>
					Stop
				</Button>
			</div>

			{/* Path planning controls (milestone 8) */}
			<div className="flex items-center justify-between gap-2">
				<span className="text-muted-foreground text-xs">Planner</span>
				<div className="flex items-center gap-1">
					<Button
						variant={planner.algorithm === 'astar' ? 'default' : 'outline'}
						size="xs"
						onClick={() => setPlanner({ ...planner, algorithm: 'astar' })}
					>
						A*
					</Button>
					<Button
						variant={planner.algorithm === 'dijkstra' ? 'default' : 'outline'}
						size="xs"
						onClick={() => setPlanner({ ...planner, algorithm: 'dijkstra' })}
					>
						Dijkstra
					</Button>
				</div>
			</div>
			<div className="flex items-center justify-between">
				<span className="text-muted-foreground text-xs">Path overlay</span>
				<Button
					variant={showPath ? 'default' : 'outline'}
					size="xs"
					onClick={togglePath}
					data-testid="path-toggle"
				>
					{showPath ? 'On' : 'Off'}
				</Button>
			</div>
			<div className="grid grid-cols-2 gap-x-3 gap-y-1">
				<span className="text-muted-foreground text-xs">Waypoints</span>
				<span className="text-right font-mono text-foreground text-xs">{path.length}</span>
			</div>
		</WidgetCard>
	)
}

function StatusBadge({ status, autonomous }: { status: NavStatus; autonomous: boolean }) {
	const tone =
		!autonomous || status === 'idle'
			? 'text-muted-foreground'
			: status === 'blocked'
				? 'text-destructive'
				: status === 'driving'
					? 'text-emerald-500'
					: status === 'rotating'
						? 'text-amber-500'
						: 'text-cyan-500'
	const label = !autonomous ? 'manual' : status
	return (
		<span data-testid="nav-status" className={`flex items-center gap-1 font-mono text-xs ${tone}`}>
			<span
				className={`inline-block size-1.5 rounded-full bg-current ${
					status === 'driving' || status === 'rotating' ? 'animate-pulse' : ''
				}`}
			/>
			{label}
		</span>
	)
}
