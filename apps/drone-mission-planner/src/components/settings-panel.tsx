import { ChevronDown, Gauge, MapPin, PlaneTakeoff, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { bootstrapWaypoints, missionDistance } from '@/mission'
import { usePlannerStore } from '@/store'

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

			<section className={sectionClass}>
				<h3 className={headingClass}>
					<PlaneTakeoff aria-hidden="true" />
					Flight profile
				</h3>
				<SettingField
					label="Cruise altitude"
					description="Above launch point"
					unit="m"
					min={5}
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
					<RouteStat value={String(bootstrapWaypoints.length)} label="Waypoints" />
					<RouteStat
						value={`${missionDistance(bootstrapWaypoints).toFixed(1)} m`}
						label="Distance"
					/>
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
