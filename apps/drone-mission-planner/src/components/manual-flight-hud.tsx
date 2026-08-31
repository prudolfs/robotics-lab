import {
	CONTROL_RESPONSE_OPTIONS,
	type ControlResponse,
	type DroneSimulation,
} from '@robotics-lab/drone'
import { BatteryMedium, Gamepad2, Power, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DroneSimulationControls, FlightControlState } from '@/simulation/use-drone-simulation'

export function ManualFlightHud({
	simulation,
	flightControl,
	controls,
}: {
	simulation: DroneSimulation
	flightControl: FlightControlState
	controls: DroneSimulationControls
}) {
	const status = flightControl.emergencyStopped
		? 'Emergency stop'
		: flightControl.armed
			? simulation.drone.missionState
			: 'Disarmed'
	const statusClass = flightControl.emergencyStopped
		? 'text-red-300'
		: flightControl.armed
			? 'text-emerald-300'
			: 'text-white/60'

	return (
		<>
			<section
				className="absolute top-[72px] right-[18px] z-[4] w-[238px] rounded-xl border border-white/15 bg-[#08100d]/75 p-3 text-white shadow-xl backdrop-blur-md max-[620px]:top-[66px] max-[620px]:right-3 max-[860px]:w-[210px]"
				aria-label="Manual flight HUD"
			>
				<div className="flex items-start justify-between gap-3">
					<div>
						<small className="block text-[8px] text-white/45 uppercase tracking-[0.12em]">
							Manual flight
						</small>
						<strong className={`mt-1 block text-xs capitalize ${statusClass}`} aria-live="polite">
							{status}
						</strong>
					</div>
					<div className="flex items-center gap-1.5 text-[9px] text-white/55">
						<Gamepad2 className={flightControl.gamepadConnected ? 'text-emerald-300' : ''} />
						{flightControl.gamepadConnected ? 'PAD' : 'KEYS'}
					</div>
				</div>

				<div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
					<AxisMeter label="THR" value={flightControl.input.throttle} />
					<AxisMeter label="YAW" value={flightControl.input.yaw} />
					<AxisMeter label="PIT" value={flightControl.input.pitch} />
					<AxisMeter label="ROL" value={flightControl.input.roll} />
				</div>

				<div className="mt-3 flex items-center gap-2 border-white/10 border-t pt-2.5">
					<BatteryMedium className="size-3.5 text-emerald-300" aria-hidden="true" />
					<div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
						<div
							className="h-full rounded-full bg-emerald-300"
							style={{ width: `${simulation.drone.batteryLevel}%` }}
						/>
					</div>
					<span className="font-mono text-[9px] tabular-nums">
						{simulation.drone.batteryLevel}%
					</span>
				</div>

				<div className="mt-2.5 flex gap-1.5">
					<Button
						className="flex-1 border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
						size="sm"
						variant="outline"
						onClick={flightControl.armed ? controls.disarm : controls.arm}
					>
						<Power />
						{flightControl.armed ? 'Disarm' : 'Arm'}
					</Button>
					<Button
						className="flex-1 border border-red-400/25 bg-red-500/20 text-red-200 hover:bg-red-500/30 hover:text-red-100"
						size="sm"
						variant="destructive"
						onClick={controls.emergencyStop}
					>
						<ShieldAlert />
						Kill
					</Button>
				</div>

				<fieldset className="mt-2.5 flex items-center gap-1">
					<legend className="float-left mr-auto text-[8px] text-white/45 uppercase tracking-[0.08em]">
						Response
					</legend>
					{CONTROL_RESPONSE_OPTIONS.map((response, index) => (
						<Button
							aria-label={`${response * 100}% control response`}
							aria-pressed={flightControl.response === response}
							className={
								flightControl.response === response
									? 'bg-primary text-primary-foreground'
									: 'text-white/55 hover:bg-white/10 hover:text-white'
							}
							key={response}
							size="xs"
							variant="ghost"
							onClick={() => controls.setControlResponse(response as ControlResponse)}
						>
							{index + 1} · {response * 100}%
						</Button>
					))}
				</fieldset>
			</section>

			<div className="absolute bottom-[18px] left-[18px] z-[4] flex flex-wrap gap-2 rounded-lg border border-white/15 bg-[#08100d]/55 px-2.5 py-2 text-[9px] text-white/70 backdrop-blur-sm max-[620px]:bottom-3 max-[620px]:left-3">
				<ControlHint keys="WASD" label="Pitch / roll" />
				<ControlHint keys="ARROWS" label="Throttle / yaw" />
				<ControlHint keys="R" label="Arm" />
				<ControlHint keys="SPACE" label="Kill" danger />
			</div>
		</>
	)
}

function AxisMeter({ label, value }: { label: string; value: number }) {
	return (
		<div className="grid grid-cols-[24px_1fr] items-center gap-1.5">
			<span className="font-mono text-[8px] text-white/45">{label}</span>
			<div className="relative h-1 rounded-full bg-white/10">
				<i className="absolute top-[-2px] left-1/2 h-[5px] w-px bg-white/25" />
				<i
					className="absolute top-[-1px] block size-1.5 -translate-x-1/2 rounded-full bg-primary shadow-[0_0_5px_currentColor]"
					style={{ left: `${(value + 1) * 50}%` }}
				/>
			</div>
		</div>
	)
}

function ControlHint({
	keys,
	label,
	danger = false,
}: {
	keys: string
	label: string
	danger?: boolean
}) {
	return (
		<span className="flex items-center gap-1.5">
			<kbd
				className={`rounded border px-1 py-0.5 font-mono text-[8px] ${danger ? 'border-red-400/35 text-red-200' : 'border-white/20 text-white'}`}
			>
				{keys}
			</kbd>
			{label}
		</span>
	)
}
