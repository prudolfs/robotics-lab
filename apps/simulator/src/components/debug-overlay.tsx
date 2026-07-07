import type { RobotState } from '@robotics-lab/robot'
import { Button } from '@/components/ui/button'

const fmt = (n: number) => n.toFixed(2)
const deg = (rad: number) => `${((rad * 180) / Math.PI).toFixed(1)}°`

export function DebugOverlay({ robot, onReset }: { robot: RobotState; onReset: () => void }) {
	const { pose, velocity, wheels } = robot
	const speed = Math.hypot(velocity.vx, velocity.vy)

	return (
		<div
			data-testid="robot-debug"
			className="pointer-events-none absolute bottom-4 left-4 flex w-64 flex-col gap-2 rounded-lg border border-border bg-card/80 p-3 backdrop-blur-sm"
		>
			<div className="flex items-center justify-between">
				<span className="font-semibold text-foreground text-sm">Robot debug</span>
				<Button variant="outline" size="xs" onClick={onReset} className="pointer-events-auto">
					Reset
				</Button>
			</div>

			<DebugRow label="Position" value={`x ${fmt(pose.x)}  y ${fmt(pose.y)}`} />
			<div data-testid="robot-pose" className="sr-only" aria-hidden="true">
				x: {fmt(pose.x)} y: {fmt(pose.y)} heading: {deg(pose.heading)}
			</div>
			<DebugRow label="Heading" value={deg(pose.heading)} />
			<DebugRow label="Speed" value={`${fmt(speed)} m/s`} />
			<DebugRow label="Turn rate" value={`${fmt(velocity.omega)} rad/s`} />
			<DebugRow label="Wheels" value={`L ${fmt(wheels.leftWheel)}  R ${fmt(wheels.rightWheel)}`} />
		</div>
	)
}

function DebugRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col">
			<span className="text-muted-foreground text-xs">{label}</span>
			<span className="font-mono text-foreground text-sm">{value}</span>
		</div>
	)
}
