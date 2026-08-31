import type { DroneSensorConfig, DroneSensorReadings } from '@robotics-lab/sensors'
import { Activity, Mountain, Radar, Satellite } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatHeading } from '@/mission'

const resolutions = [36, 90, 180, 360] as const

export function SensorHud({
	readings,
	config,
	showRays,
	showHits,
	onConfigChange,
	onShowRaysChange,
	onShowHitsChange,
}: {
	readings: DroneSensorReadings
	config: DroneSensorConfig
	showRays: boolean
	showHits: boolean
	onConfigChange: (config: DroneSensorConfig) => void
	onShowRaysChange: (show: boolean) => void
	onShowHitsChange: (show: boolean) => void
}) {
	const hits = readings.lidar.samples.filter((sample) => sample.hit !== null)
	const nearest = hits.reduce(
		(distance, sample) => Math.min(distance, sample.distance),
		config.lidar.range,
	)
	const acceleration = Math.hypot(
		readings.imu.acceleration.x,
		readings.imu.acceleration.y,
		readings.imu.acceleration.z,
	)
	const angularSpeed = Math.hypot(
		readings.imu.angularVelocity.x,
		readings.imu.angularVelocity.y,
		readings.imu.angularVelocity.z,
	)

	return (
		<section
			className="absolute top-[164px] left-[18px] z-[4] w-[310px] rounded-xl border border-white/15 bg-[#08100d]/75 p-3 text-white shadow-xl backdrop-blur-md max-[620px]:hidden max-[860px]:w-[260px]"
			aria-label="Sensor HUD"
		>
			<div className="flex items-center justify-between">
				<span className="flex items-center gap-1.5 text-[9px] text-cyan-300 uppercase tracking-[0.1em]">
					<Radar className="size-3.5" /> Live sensors
				</span>
				<span className="font-mono text-[9px] text-white/45">10 Hz</span>
			</div>

			<div className="mt-2.5 grid grid-cols-4 gap-1.5">
				<SensorValue
					icon={Radar}
					label="Lidar"
					value={`${hits.length}/${readings.lidar.samples.length}`}
				/>
				<SensorValue
					icon={Mountain}
					label="AGL"
					value={`${readings.altimeter.altitudeAgl.toFixed(1)}m`}
				/>
				<SensorValue
					icon={Satellite}
					label="WP dist"
					value={
						readings.gps.waypointDistance === null
							? '—'
							: `${readings.gps.waypointDistance.toFixed(1)}m`
					}
				/>
				<SensorValue icon={Activity} label="IMU" value={`${acceleration.toFixed(1)}m/s²`} />
			</div>

			<div className="mt-2.5 grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 border-white/10 border-t pt-2.5 text-[9px]">
				<label className="grid grid-cols-[42px_1fr] items-center gap-2">
					<span className="text-white/45 uppercase">Range</span>
					<input
						aria-label="Lidar range"
						className="h-1 cursor-pointer accent-cyan-300"
						type="range"
						min={2}
						max={20}
						value={config.lidar.range}
						onChange={(event) =>
							onConfigChange({
								...config,
								lidar: { ...config.lidar, range: event.target.valueAsNumber },
							})
						}
					/>
				</label>
				<output className="w-7 text-right font-mono">{config.lidar.range}m</output>
				<label className="grid grid-cols-[42px_1fr] items-center gap-2">
					<span className="text-white/45 uppercase">GPS σ</span>
					<input
						aria-label="GPS noise"
						className="h-1 cursor-pointer accent-cyan-300"
						type="range"
						min={0}
						max={2}
						step={0.1}
						value={config.gpsNoise}
						onChange={(event) =>
							onConfigChange({ ...config, gpsNoise: event.target.valueAsNumber })
						}
					/>
				</label>
				<output className="w-7 text-right font-mono">{config.gpsNoise.toFixed(1)}m</output>
			</div>

			<div className="mt-2.5 flex items-center gap-1 border-white/10 border-t pt-2.5">
				<span className="mr-auto text-[8px] text-white/45 uppercase">Resolution</span>
				{resolutions.map((resolution) => (
					<Button
						aria-label={`${resolution} lidar rays`}
						aria-pressed={config.lidar.rayCount === resolution}
						className={
							config.lidar.rayCount === resolution
								? 'bg-cyan-300 text-slate-950 hover:bg-cyan-200'
								: 'text-white/50 hover:bg-white/10 hover:text-white'
						}
						key={resolution}
						size="xs"
						variant="ghost"
						onClick={() =>
							onConfigChange({ ...config, lidar: { ...config.lidar, rayCount: resolution } })
						}
					>
						{resolution}
					</Button>
				))}
			</div>

			<div className="mt-2 flex items-center gap-1.5 text-[9px]">
				<Button
					aria-pressed={showRays}
					className="text-white/65 hover:bg-white/10 hover:text-white"
					size="xs"
					variant="ghost"
					onClick={() => onShowRaysChange(!showRays)}
				>
					Rays {showRays ? 'on' : 'off'}
				</Button>
				<Button
					aria-pressed={showHits}
					className="text-white/65 hover:bg-white/10 hover:text-white"
					size="xs"
					variant="ghost"
					onClick={() => onShowHitsChange(!showHits)}
				>
					Hits {showHits ? 'on' : 'off'}
				</Button>
				<span className="ml-auto font-mono text-white/45">
					{nearest.toFixed(1)}m · {formatHeading(readings.imu.heading)} · {angularSpeed.toFixed(2)}
					rad/s
				</span>
			</div>
		</section>
	)
}

function SensorValue({
	icon: Icon,
	label,
	value,
}: {
	icon: typeof Radar
	label: string
	value: string
}) {
	return (
		<div className="min-w-0 rounded-md border border-white/10 bg-white/5 p-1.5">
			<span className="flex items-center gap-1 text-[7px] text-white/40 uppercase">
				<Icon className="size-2.5" /> {label}
			</span>
			<strong className="mt-1 block truncate font-mono text-[9px]">{value}</strong>
		</div>
	)
}
