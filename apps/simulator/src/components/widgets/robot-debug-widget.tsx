// Robot debug widget (Utils tab) — docs/hud.md.
//
// The debug readout: pose / heading / speed / turn rate / wheels + a Reset
// button. All labels and the hidden `data-testid="robot-pose"` readout are
// kept byte-for-byte from the original overlay; the absolute, `pointer-events-none`
// placement is gone — it is now a normal-flow card in the Utils tab or docked on
// the viewport. The widget subscribes to the observed `robot` from the store
// itself so it re-renders each frame (it is shared between the panel copy and
// the popped copy via the widget registry).
// `data-testid="robot-debug"` is kept on the card so existing tests that read
// the pose / hit the Reset button keep working once they switch to the Utils
// tab.

import { Button } from '@/components/ui/button'
import { WidgetCard } from '@/components/widgets/widget-card'
import { useSimulatorStore, type WidgetId } from '@/store'

const fmt = (n: number) => n.toFixed(2)
const deg = (rad: number) => `${((rad * 180) / Math.PI).toFixed(1)}°`

const WIDGET: WidgetId = 'utils.robotDebug'

export function RobotDebugWidget({ onReset }: { onReset: () => void }) {
	const robot = useSimulatorStore((s) => s.robot)
	const { pose, velocity, wheels } = robot
	const speed = Math.hypot(velocity.vx, velocity.vy)

	return (
		<WidgetCard title="Robot debug" widget={WIDGET} data-testid="robot-debug" bodyClassName="gap-2">
			<div className="flex items-center justify-end">
				<Button variant="outline" size="xs" onClick={onReset}>
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
		</WidgetCard>
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
