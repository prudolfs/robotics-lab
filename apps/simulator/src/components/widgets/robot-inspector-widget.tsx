// Robot inspector (Inspect tab) — docs/simulator.md milestone 14.
//
// A richer read-only view of the robot's live state than the Utils-tab
// `RobotDebugWidget`: pose (x/y/heading), linear + angular velocity, wheel
// speeds, commanded drive input, and the robot's physical parameters
// (wheelbase / wheel radius). Mirrors the reference "Robot inspector" panel:
// every row is a labelled mono readout so a glance reads ground truth + the
// commanded drive at once. The widget owns no simulation state — it only
// subscribes to the observed `robot` snapshot the pushes into the store.

import { WidgetCard } from '@/components/widgets/widget-card'
import { useSimulatorStore, type WidgetId } from '@/store'

const WIDGET: WidgetId = 'inspect.robot'
const fmt = (n: number) => n.toFixed(3)
const deg = (rad: number) => `${((rad * 180) / Math.PI).toFixed(1)}°`

export function RobotInspectorWidget() {
	const robot = useSimulatorStore((s) => s.robot)
	const input = useSimulatorStore((s) => s.input)
	const { pose, velocity, wheels, params } = robot
	const speed = Math.hypot(velocity.vx, velocity.vy)

	return (
		<WidgetCard
			title="Robot inspector"
			widget={WIDGET}
			data-testid="robot-inspector"
			bodyClassName="gap-2"
		>
			<SectionLabel>Pose</SectionLabel>
			<Row label="x" value={`${fmt(pose.x)} m`} />
			<Row label="y" value={`${fmt(pose.y)} m`} />
			<Row label="heading" value={deg(pose.heading)} />

			<SectionLabel>Velocity</SectionLabel>
			<Row label="linear" value={`${fmt(speed)} m/s`} />
			<Row label="vx" value={`${fmt(velocity.vx)} m/s`} />
			<Row label="vy" value={`${fmt(velocity.vy)} m/s`} />
			<Row label="angular" value={`${fmt(velocity.omega)} rad/s`} />

			<SectionLabel>Wheels</SectionLabel>
			<Row label="left (measured)" value={`${fmt(wheels.leftWheel)} m/s`} />
			<Row label="right (measured)" value={`${fmt(wheels.rightWheel)} m/s`} />
			<Row label="left (commanded)" value={`${fmt(input.leftWheel)} m/s`} />
			<Row label="right (commanded)" value={`${fmt(input.rightWheel)} m/s`} />

			<SectionLabel>Parameters</SectionLabel>
			<Row label="wheelbase" value={`${fmt(params.wheelBase)} m`} />
			<Row label="wheel radius" value={`${fmt(params.wheelRadius)} m`} />
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
