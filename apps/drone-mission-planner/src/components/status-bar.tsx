import { PREVIEW_DRONE_STATE } from '@/drone-preview'
import { formatHeading } from '@/mission'

const telemetry = [
	['LAT', '56.9496° N'],
	['LON', '24.1052° E'],
	['ALT', `${PREVIEW_DRONE_STATE.position.y.toFixed(1)} m`],
	['HDG', formatHeading(0)],
	['BAT', `${PREVIEW_DRONE_STATE.batteryLevel}%`],
] as const

export function StatusBar({ webgpuSupported }: { webgpuSupported: boolean }) {
	return (
		<footer className="relative z-10 grid h-[34px] grid-cols-[1fr_auto_1fr] items-center border-border border-t bg-background px-[15px] text-[9px] text-muted-foreground uppercase tracking-[0.07em] max-[860px]:grid-cols-[1fr_auto]">
			<div
				className={
					webgpuSupported
						? 'flex items-center gap-[7px] text-emerald-400'
						: 'flex items-center gap-[7px] text-primary'
				}
			>
				<span
					className={
						webgpuSupported
							? 'size-1.5 rounded-full bg-emerald-400 shadow-[0_0_7px_currentColor]'
							: 'size-1.5 rounded-full bg-primary shadow-[0_0_7px_currentColor]'
					}
				/>
				{webgpuSupported ? 'WebGPU ready' : 'WebGPU unavailable'}
			</div>
			<div className="flex h-full">
				{telemetry.map(([label, value], index) => (
					<span
						className={`flex items-center gap-1.5 border-border border-l px-[13px] text-foreground tabular-nums last:border-r ${index < 2 ? 'max-[860px]:hidden' : ''} ${index === 2 || index === 3 ? 'max-[620px]:hidden' : ''}`}
						key={label}
					>
						<small className="text-[8px] text-muted-foreground">{label}</small>
						{value}
					</span>
				))}
			</div>
			<div className="justify-self-end max-[860px]:hidden">
				{PREVIEW_DRONE_STATE.missionState.toUpperCase()}{' '}
				<span className="px-1.5 text-border">•</span> PLANNING
			</div>
		</footer>
	)
}
