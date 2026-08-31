import type { MissionExecution } from '@robotics-lab/drone'
import { CircleStop, House, Pause, PlaneLanding, Play, Power } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DroneSimulationControls } from '@/simulation/use-drone-simulation'

export function MissionExecutionHud({
	execution,
	controls,
}: {
	execution: MissionExecution
	controls: DroneSimulationControls
}) {
	const currentItem = execution.items[execution.currentIndex]
	const canStart = execution.phase === 'armed' && execution.items.length > 0

	return (
		<section
			className="absolute bottom-[18px] left-1/2 z-[5] w-[min(480px,calc(100%-370px))] -translate-x-1/2 rounded-xl border border-white/15 bg-[#08100d]/80 p-3 text-white shadow-xl backdrop-blur-md max-[620px]:bottom-3 max-[860px]:bottom-[62px] max-[860px]:w-[min(440px,calc(100%-36px))]"
			aria-label="Mission execution"
		>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<small className="block text-[8px] text-white/45 uppercase tracking-[0.12em]">
						Mission execution
					</small>
					<strong
						className="mt-1 block truncate text-emerald-300 text-xs capitalize"
						aria-live="polite"
					>
						{execution.paused ? `${execution.phase} · paused` : execution.phase.replace('-', ' ')}
					</strong>
				</div>
				<span className="font-mono text-[10px] text-white/60 tabular-nums">
					{Math.round(execution.progress * 100)}%
				</span>
			</div>

			<div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
				<div
					className="h-full rounded-full bg-primary transition-[width] duration-150"
					style={{ width: `${execution.progress * 100}%` }}
				/>
			</div>

			<ol className="mt-2 flex list-none items-center gap-1" aria-label="Mission timeline">
				{execution.items.map((item, index) => {
					const state =
						index < execution.currentIndex
							? 'complete'
							: index === execution.currentIndex
								? 'current'
								: 'pending'
					return (
						<li
							key={item.id}
							title={`${index + 1}. ${missionItemLabel(item.type)}`}
							className={`h-1.5 min-w-1 flex-1 rounded-full ${
								state === 'complete'
									? 'bg-emerald-300'
									: state === 'current'
										? 'bg-amber-300 shadow-[0_0_6px_currentColor]'
										: 'bg-white/15'
							}`}
						/>
					)
				})}
			</ol>

			<div className="mt-2 flex items-center justify-between gap-3 text-[9px] text-white/55">
				<span className="truncate">
					{currentItem
						? `${execution.currentIndex + 1}. ${missionItemLabel(currentItem.type)}`
						: execution.completed
							? 'Mission complete'
							: 'Ready'}
				</span>
				<span className="shrink-0 font-mono tabular-nums">
					{execution.target
						? `TARGET ${execution.target.x.toFixed(1)}, ${execution.target.y.toFixed(1)}, ${execution.target.z.toFixed(1)}`
						: 'NO TARGET'}
				</span>
			</div>

			<div className="mt-2.5 flex flex-wrap gap-1.5 border-white/10 border-t pt-2.5">
				{execution.running ? (
					<Button
						size="sm"
						onClick={execution.paused ? controls.resumeMission : controls.pauseMission}
					>
						{execution.paused ? <Play /> : <Pause />}
						{execution.paused ? 'Resume' : 'Pause'}
					</Button>
				) : execution.phase === 'armed' ? (
					<Button size="sm" disabled={!canStart} onClick={controls.startMission}>
						<Play /> Start
					</Button>
				) : (
					<Button size="sm" onClick={controls.armMission}>
						<Power /> Arm
					</Button>
				)}
				<Button
					size="sm"
					variant="outline"
					className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
					disabled={!execution.running}
					onClick={controls.rtlMission}
				>
					<House /> RTL
				</Button>
				<Button
					size="sm"
					variant="outline"
					className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
					disabled={!execution.running}
					onClick={controls.landMission}
				>
					<PlaneLanding /> Land
				</Button>
				<Button
					size="icon-sm"
					variant="ghost"
					className="ml-auto text-white/55 hover:bg-white/10 hover:text-white"
					disabled={!execution.running && execution.phase !== 'armed'}
					onClick={controls.disarm}
					aria-label="Disarm mission"
				>
					<CircleStop />
				</Button>
			</div>
		</section>
	)
}

function missionItemLabel(type: MissionExecution['items'][number]['type']): string {
	return type === 'rtl' ? 'Return to launch' : type.charAt(0).toUpperCase() + type.slice(1)
}
