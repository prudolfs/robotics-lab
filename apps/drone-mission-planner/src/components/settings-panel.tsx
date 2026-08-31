import { mapNames } from '@robotics-lab/maps'
import {
	ChevronDown,
	Cpu,
	Cuboid,
	Gauge,
	Map as MapIcon,
	MapPin,
	PlaneTakeoff,
	RotateCcw,
} from 'lucide-react'
import { MissionEditorPanel } from '@/components/mission-editor-panel'
import { Button } from '@/components/ui/button'
import { PREVIEW_DRONE_PARAMS, PREVIEW_DRONE_STATE } from '@/drone-preview'
import { missionDistance } from '@/mission'
import { missionWaypoints } from '@/mission-plan'
import { usePlannerStore } from '@/store'
import { summarizeWorld, WORLD_SCALE_OPTIONS, type WorldScale } from '@/world'

const sectionClass = 'border-border border-b p-[18px]'
const headingClass =
	'mb-4 flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-[0.1em] [&_svg]:size-3.5 [&_svg]:text-primary'

export function SettingsPanel() {
	const altitude = usePlannerStore((state) => state.cruiseAltitude)
	const speed = usePlannerStore((state) => state.cruiseSpeed)
	const returnToHome = usePlannerStore((state) => state.returnToHome)
	const setAltitude = usePlannerStore((state) => state.setCruiseAltitude)
	const setSpeed = usePlannerStore((state) => state.setCruiseSpeed)
	const setReturnToHome = usePlannerStore((state) => state.setReturnToHome)
	const selectedMap = usePlannerStore((state) => state.selectedMap)
	const world = usePlannerStore((state) => state.world)
	const worldScale = usePlannerStore((state) => state.worldScale)
	const setSelectedMap = usePlannerStore((state) => state.setSelectedMap)
	const setWorldScale = usePlannerStore((state) => state.setWorldScale)
	const worldSummary = summarizeWorld(world)
	const missionItems = usePlannerStore((state) => state.missionItems)
	const routeWaypoints = missionWaypoints(missionItems).map((waypoint) => ({
		id: waypoint.id,
		position: waypoint.position,
		altitude: waypoint.altitude ?? 0,
	}))

	return (
		<aside
			className="min-w-0 overflow-y-auto border-border border-l bg-background/95 backdrop-blur-lg max-[620px]:border-t max-[620px]:border-l-0"
			aria-label="Mission settings"
		>
			<div className="flex items-center justify-between border-border border-b px-[18px] py-[19px]">
				<div>
					<span className="text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
						Configuration
					</span>
					<h2 className="mt-1 font-semibold text-lg tracking-[-0.035em]">Mission settings</h2>
				</div>
				<Button aria-label="Collapse settings" variant="ghost" size="icon">
					<ChevronDown />
				</Button>
			</div>
			<MissionEditorPanel />

			<section className={sectionClass}>
				<h3 className={headingClass}>
					<Cpu aria-hidden="true" />
					Vehicle
				</h3>
				<div className="grid grid-cols-2 gap-2">
					<RouteStat value="X4" label="Rotor frame" />
					<RouteStat
						value={`${Math.round(PREVIEW_DRONE_PARAMS.hoverThrottle * 100)}%`}
						label="Hover throttle"
					/>
					<RouteStat value={`${PREVIEW_DRONE_STATE.batteryLevel}%`} label="Battery" />
					<RouteStat value={PREVIEW_DRONE_STATE.missionState} label="Vehicle state" />
				</div>
			</section>

			<section className={sectionClass}>
				<h3 className={headingClass}>
					<MapIcon aria-hidden="true" />
					World
				</h3>
				<label className="grid gap-1.5">
					<span className="font-medium text-xs">Environment map</span>
					<select
						className="h-8 w-full rounded-md border border-input bg-muted px-2.5 text-xs capitalize outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
						value={selectedMap}
						onChange={(event) => setSelectedMap(event.target.value)}
					>
						{mapNames().map((name) => (
							<option key={name} value={name}>
								{name}
							</option>
						))}
					</select>
				</label>
				<div className="mt-3.5 flex items-center justify-between gap-3">
					<span className="grid gap-[3px]">
						<strong className="font-medium text-xs">World scale</strong>
						<small className="text-[10px] text-muted-foreground">Display multiplier</small>
					</span>
					<fieldset className="flex gap-1">
						<legend className="sr-only">World scale</legend>
						{WORLD_SCALE_OPTIONS.map((scale) => (
							<Button
								aria-pressed={worldScale === scale}
								key={scale}
								size="xs"
								variant={worldScale === scale ? 'default' : 'outline'}
								onClick={() => setWorldScale(scale as WorldScale)}
							>
								{scale}×
							</Button>
						))}
					</fieldset>
				</div>
				<div className="mt-3 grid grid-cols-2 gap-2">
					<div className="flex items-center gap-2 rounded-md border border-border bg-muted/60 p-2 text-[10px] text-muted-foreground">
						<Cuboid className="size-3.5 text-primary" />
						<span>
							<strong className="block text-foreground">{worldSummary.obstacles}</strong>Objects
						</span>
					</div>
					<div className="flex items-center gap-2 rounded-md border border-border bg-muted/60 p-2 text-[10px] text-muted-foreground">
						<MapPin className="size-3.5 text-primary" />
						<span>
							<strong className="block text-foreground">{worldSummary.area} m²</strong>Area
						</span>
					</div>
				</div>
			</section>

			<section className={sectionClass}>
				<h3 className={headingClass}>
					<PlaneTakeoff aria-hidden="true" />
					Flight profile
				</h3>
				<SettingField
					label="Cruise altitude"
					description="Above launch point"
					unit="m"
					min={0.5}
					max={120}
					value={altitude}
					onChange={setAltitude}
				/>
				<SettingField
					label="Cruise speed"
					description="Target ground speed"
					unit="m/s"
					min={1}
					max={20}
					value={speed}
					onChange={setSpeed}
				/>
			</section>

			<section className={sectionClass}>
				<h3 className={headingClass}>
					<MapPin aria-hidden="true" />
					Route summary
				</h3>
				<div className="grid grid-cols-2 gap-2">
					<RouteStat value={String(routeWaypoints.length)} label="Waypoints" />
					<RouteStat value={`${missionDistance(routeWaypoints).toFixed(1)} m`} label="Distance" />
				</div>
			</section>

			<section className={sectionClass}>
				<h3 className={headingClass}>
					<RotateCcw aria-hidden="true" />
					Failsafe
				</h3>
				<label className="flex items-center justify-between gap-3.5">
					<span className="grid gap-[3px]">
						<strong className="font-medium text-xs">Return to home</strong>
						<small className="text-[10px] text-muted-foreground">After the final waypoint</small>
					</span>
					<span className="relative">
						<input
							className="peer sr-only"
							type="checkbox"
							checked={returnToHome}
							onChange={(event) => setReturnToHome(event.target.checked)}
						/>
						<span className="block h-[19px] w-[34px] cursor-pointer rounded-full border border-border bg-muted transition-colors peer-checked:border-emerald-500/50 peer-checked:bg-emerald-500/30 peer-focus-visible:ring-2 peer-focus-visible:ring-ring" />
						<span className="pointer-events-none absolute top-[3px] left-[3px] size-[13px] rounded-full bg-muted-foreground transition-transform peer-checked:translate-x-[15px] peer-checked:bg-emerald-400" />
					</span>
				</label>
			</section>

			<div className="m-[18px] flex gap-[11px] rounded-[10px] border border-emerald-400/25 bg-emerald-400/10 p-[13px] text-emerald-400">
				<Gauge className="size-[17px]" aria-hidden="true" />
				<span className="grid gap-[3px]">
					<strong className="text-[11px]">Ready for route planning</strong>
					<small className="text-[9px] text-muted-foreground">
						Vehicle profile and home point set
					</small>
				</span>
			</div>
		</aside>
	)
}

function SettingField({
	label,
	description,
	unit,
	min,
	max,
	value,
	onChange,
}: {
	label: string
	description: string
	unit: string
	min: number
	max: number
	value: number
	onChange: (value: number) => void
}) {
	return (
		<label className="mt-3.5 flex items-center justify-between gap-3.5">
			<span className="grid gap-[3px]">
				<strong className="font-medium text-xs">{label}</strong>
				<small className="text-[10px] text-muted-foreground">{description}</small>
			</span>
			<span className="flex h-8 items-center overflow-hidden rounded-md border border-border bg-muted">
				<input
					className="w-11 border-0 bg-transparent text-right font-semibold text-xs outline-none"
					type="number"
					min={min}
					max={max}
					step="any"
					value={value}
					onChange={(event) => onChange(event.target.valueAsNumber)}
				/>
				<em className="pr-2 pl-1 text-[10px] text-muted-foreground not-italic">{unit}</em>
			</span>
		</label>
	)
}

function RouteStat({ value, label }: { value: string; label: string }) {
	return (
		<div className="grid gap-1 rounded-lg border border-border bg-muted/60 p-3">
			<span className="font-semibold text-lg tracking-[-0.04em]">{value}</span>
			<small className="text-[10px] text-muted-foreground uppercase tracking-[0.06em]">
				{label}
			</small>
		</div>
	)
}
