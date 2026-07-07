// Navigation HUD (milestone 7): the click-to-goal control surface.
//
// It reads the observed navigation state from the store and exposes the
// controls the milestone calls for:
//
//   - status of the controller (idle / rotating / driving / arrived)
//   - active goal coordinates + remaining distance
//   - goal queue length
//   - toggle autonomy (auto-drive on/off)
//   - clear the goal queue
//
// As with the other HUDs, this component only reads/writes Zustand app state
// and the e-stop / reset controls passed from the loop hook — it owns no
// simulation state. This keeps React with the rendering and the loop with the
// simulation, exactly as the architecture requires.

import { Button } from '@/components/ui/button'
import type { SimulationControls } from '@/sim/use-simulation-loop'
import { useSimulatorStore } from '@/store'

const fmt = (n: number) => n.toFixed(2)

export function NavigationHud({ controls }: { controls: SimulationControls }) {
	const goals = useSimulatorStore((s) => s.goals)
	const autonomous = useSimulatorStore((s) => s.autonomous)
	const navStatus = useSimulatorStore((s) => s.navStatus)
	const robot = useSimulatorStore((s) => s.robot)
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
		<div className="pointer-events-auto absolute bottom-4 left-1/2 flex w-72 -translate-x-1/2 flex-col gap-2 rounded-lg border border-border bg-card/80 p-3 backdrop-blur-sm">
			<div className="flex items-center justify-between">
				<span className="font-semibold text-foreground text-sm">Navigation</span>
				<StatusBadge status={navStatus} autonomous={autonomous} />
			</div>

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

			<span className="text-[10px] text-muted-foreground">
				click the floor to set a goal · shift-click to queue waypoints
			</span>

			{/* Coverage controls (milestone 9) */}
			<div className="flex items-center justify-between gap-2">
				<span className="font-semibold text-foreground text-xs">Coverage</span>
				<div className="flex items-center gap-1">
					{coverageMode && !coverageComplete && (
						<span className="animate-pulse text-amber-500 text-xs">Running...</span>
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
					disabled={coverageMode}
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
				<Button variant={showPath ? 'default' : 'outline'} size="xs" onClick={togglePath}>
					{showPath ? 'On' : 'Off'}
				</Button>
			</div>
			<div className="grid grid-cols-2 gap-x-3 gap-y-1">
				<span className="text-muted-foreground text-xs">Waypoints</span>
				<span className="text-right font-mono text-foreground text-xs">{path.length}</span>
			</div>
		</div>
	)
}

function StatusBadge({
	status,
	autonomous,
}: {
	status: 'idle' | 'rotating' | 'driving' | 'arrived'
	autonomous: boolean
}) {
	const tone =
		!autonomous || status === 'idle'
			? 'text-muted-foreground'
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
