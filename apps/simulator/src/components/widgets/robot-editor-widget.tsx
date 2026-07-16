// Robot editor widget (Editor tab) — milestone 12.
//
// The robot placement controls: "Set spawn here" (rebase the spawn pose to the
// robot's current pose), "Reset pose" (send the robot back to its spawn),
// and a "Place spawn" tool that lets the user click the floor to set a new
// spawn point. None of these mutate the world; they only rebase the spawn /
// reset the sim via the loop (milestone 12 — Robot).

import { Button } from '@/components/ui/button'
import { WidgetCard } from '@/components/widgets/widget-card'
import { cn } from '@/lib/utils'
import type { SimulationControls } from '@/sim/use-simulation-loop'
import { useSimulatorStore } from '@/store'

const fmt = (n: number) => n.toFixed(2)
const deg = (rad: number) => `${((rad * 180) / Math.PI).toFixed(1)}°`

export function RobotEditorWidget({ controls }: { controls: SimulationControls }) {
	const tool = useSimulatorStore((s) => s.editorTool)
	const setTool = useSimulatorStore((s) => s.setEditorTool)
	const spawnPose = useSimulatorStore((s) => s.spawnPose)
	const robot = useSimulatorStore((s) => s.robot)
	const resetRobotPose = useSimulatorStore((s) => s.editorResetRobotPose)

	const setSpawnActive = tool === 'setSpawn'

	return (
		<WidgetCard title="Robot editor" widget="editor.robot" bodyClassName="gap-2">
			<div className="grid grid-cols-2 gap-x-3 gap-y-1">
				<span className="text-muted-foreground text-xs">Spawn</span>
				<span
					data-testid="editor-spawn-pose"
					className="text-right font-mono text-foreground text-xs"
				>
					({fmt(spawnPose.x)}, {fmt(spawnPose.y)}) · {deg(spawnPose.heading)}
				</span>
				<span className="text-muted-foreground text-xs">Robot</span>
				<span className="text-right font-mono text-foreground text-xs">
					({fmt(robot.pose.x)}, {fmt(robot.pose.y)})
				</span>
			</div>

			<div className="flex flex-col gap-1.5">
				<Button
					data-testid="editor-tool-setSpawn"
					variant={setSpawnActive ? 'default' : 'outline'}
					size="xs"
					onClick={() => setTool(setSpawnActive ? 'none' : 'setSpawn')}
				>
					{setSpawnActive ? 'Click floor to set spawn' : 'Place spawn (click floor)'}
				</Button>
				<Button
					data-testid="editor-reset-pose-here"
					variant="outline"
					size="xs"
					onClick={resetRobotPose}
				>
					Set spawn here (current pose)
				</Button>
				<Button data-testid="editor-reset" variant="outline" size="xs" onClick={controls.reset}>
					Reset to spawn
				</Button>
			</div>

			<span
				className={cn(
					'font-mono text-[10px]',
					setSpawnActive ? 'text-amber-400' : 'text-muted-foreground',
				)}
			>
				{setSpawnActive
					? 'click a floor point to move the spawn'
					: 'reset sends the robot back to the spawn point'}
			</span>
		</WidgetCard>
	)
}
