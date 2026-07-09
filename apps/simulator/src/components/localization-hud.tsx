// Localization HUD (milestone 11): the dead-reckoning control surface.
//
// It reads the observed odometry state (estimated pose, trail length) plus the
// ground-truth robot pose from the store and exposes:
//
//   - the estimated pose vs the true pose
//   - the drift between them (the headline number for this milestone)
//   - a toggle for the odometry overlay (trail + estimate marker in the scene)
//   - a "clear trail" button so a long run doesn't clutter the floor
//
// As with the other HUDs, this component only reads/writes Zustand app state
// and owns no simulation state — the loop integrates the dead-reckoned pose
// each fixed step and the store mirrors it.

import { Button } from '@/components/ui/button'
import { useSimulatorStore } from '@/store'

const fmt = (n: number) => n.toFixed(2)
const deg = (rad: number) => `${((rad * 180) / Math.PI).toFixed(1)}°`

export function LocalizationHud() {
	const showOdometry = useSimulatorStore((s) => s.showOdometry)
	const toggleOdometry = useSimulatorStore((s) => s.toggleOdometry)
	const clearOdometry = useSimulatorStore((s) => s.clearOdometry)
	const odometryPose = useSimulatorStore((s) => s.odometryPose)
	const odometryHistory = useSimulatorStore((s) => s.odometryHistory)
	const robot = useSimulatorStore((s) => s.robot)

	// Dead-reckoned drift: distance between the estimate and ground truth.
	const drift = Math.hypot(odometryPose.x - robot.pose.x, odometryPose.y - robot.pose.y)
	const headingErr = Math.abs(odometryPose.heading - robot.pose.heading)

	return (
		<div
			data-testid="localization-hud"
			className="pointer-events-auto absolute right-88 bottom-4 flex w-56 flex-col gap-2 rounded-lg border border-border bg-card/80 p-3 backdrop-blur-sm"
		>
			<div className="flex items-center justify-between">
				<span className="font-semibold text-foreground text-sm">Localization</span>
				<Button
					variant={showOdometry ? 'default' : 'outline'}
					size="xs"
					onClick={toggleOdometry}
					data-testid="odometry-toggle"
				>
					{showOdometry ? 'Trail on' : 'Trail off'}
				</Button>
			</div>

			<div className="grid grid-cols-2 gap-x-3 gap-y-1">
				<span className="text-muted-foreground text-xs">Estimate</span>
				<span data-testid="odometry-pose" className="text-right font-mono text-foreground text-xs">
					({fmt(odometryPose.x)}, {fmt(odometryPose.y)})
				</span>
				<span className="text-muted-foreground text-xs">Est. heading</span>
				<span className="text-right font-mono text-foreground text-xs">
					{deg(odometryPose.heading)}
				</span>
				<span className="text-cyan-400 text-xs">Truth</span>
				<span className="text-right font-mono text-foreground text-xs">
					({fmt(robot.pose.x)}, {fmt(robot.pose.y)})
				</span>
				<span className="text-muted-foreground text-xs">Trail</span>
				<span data-testid="odometry-count" className="text-right font-mono text-foreground text-xs">
					{odometryHistory.length}
				</span>
				<span data-testid="odometry-drift" className="font-semibold text-amber-500 text-xs">
					Drift
				</span>
				<span className="text-right font-mono text-xs">
					<span className="text-amber-500">{fmt(drift)} m</span>
					<span className="text-muted-foreground"> · {deg(headingErr)}</span>
				</span>
			</div>

			<Button
				data-testid="clear-odometry-button"
				variant="outline"
				size="xs"
				onClick={clearOdometry}
			>
				Clear trail
			</Button>
			<span className="font-mono text-[10px] text-muted-foreground">
				dead reckoning drifts with motion noise · toggle it in the Teleop HUD
			</span>
		</div>
	)
}
