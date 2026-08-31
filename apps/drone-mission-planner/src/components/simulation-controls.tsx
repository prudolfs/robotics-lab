import { type DroneSimulation, TIME_SCALE_OPTIONS, type TimeScale } from '@robotics-lab/drone'
import { Pause, Play, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatSimulationTime } from '@/simulation/format'
import type { DroneSimulationControls as SimulationActions } from '@/simulation/use-drone-simulation'

export function SimulationControls({
	simulation,
	controls,
}: {
	simulation: DroneSimulation
	controls: SimulationActions
}) {
	return (
		<div className="absolute top-4 left-1/2 z-[4] flex -translate-x-1/2 items-center gap-2 rounded-[10px] border border-white/15 bg-[#08100d]/70 p-1.5 text-white shadow-lg backdrop-blur-md">
			<div className="grid min-w-[66px] px-1.5 leading-none">
				<small className="mb-1 text-[8px] text-white/50 uppercase tracking-[0.1em]">Sim time</small>
				<strong className="font-mono text-[11px] tabular-nums">
					{formatSimulationTime(simulation.clock.elapsedSeconds)}
				</strong>
			</div>
			<div className="h-6 w-px bg-white/15" />
			<Button
				className="text-white hover:bg-white/10 hover:text-white"
				aria-label={simulation.clock.running ? 'Pause simulation' : 'Resume simulation'}
				size="icon-sm"
				variant="ghost"
				onClick={controls.togglePause}
			>
				{simulation.clock.running ? <Pause /> : <Play />}
			</Button>
			<Button
				className="text-white hover:bg-white/10 hover:text-white"
				aria-label="Reset simulation"
				size="icon-sm"
				variant="ghost"
				onClick={controls.reset}
			>
				<RotateCcw />
			</Button>
			<div className="h-6 w-px bg-white/15" />
			<fieldset className="flex gap-0.5">
				<legend className="sr-only">Simulation speed</legend>
				{TIME_SCALE_OPTIONS.map((timeScale) => (
					<Button
						className={
							simulation.clock.timeScale === timeScale
								? 'bg-primary text-primary-foreground hover:bg-primary/90'
								: 'text-white/65 hover:bg-white/10 hover:text-white'
						}
						aria-label={`${timeScale} times speed`}
						aria-pressed={simulation.clock.timeScale === timeScale}
						key={timeScale}
						size="xs"
						variant="ghost"
						onClick={() => controls.setTimeScale(timeScale as TimeScale)}
					>
						{timeScale}×
					</Button>
				))}
			</fieldset>
		</div>
	)
}
