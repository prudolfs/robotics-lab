import { AlertTriangle, BatteryMedium, CircleX, Route, ShieldCheck, Timer } from 'lucide-react'
import type { MissionValidationResult } from '@/mission-validation'
import { usePlannerStore } from '@/store'

export function MissionValidationPanel({ validation }: { validation: MissionValidationResult }) {
	const setSelected = usePlannerStore((state) => state.setSelectedMissionItem)
	const status = validation.isValid
		? validation.warnings.length > 0
			? 'Ready with warnings'
			: 'Ready'
		: 'Blocked'

	return (
		<section className="border-border border-b p-[18px]" aria-label="Mission validation">
			<div className="flex items-center justify-between gap-3">
				<h3 className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-[0.1em]">
					<ShieldCheck className="size-3.5 text-primary" aria-hidden="true" />
					Validation
				</h3>
				<span
					className={`rounded-full px-2 py-1 font-semibold text-[9px] ${
						validation.isValid
							? validation.warnings.length > 0
								? 'bg-amber-500/12 text-amber-500'
								: 'bg-emerald-500/12 text-emerald-500'
							: 'bg-destructive/12 text-destructive'
					}`}
					aria-live="polite"
				>
					{status}
				</span>
			</div>

			<div className="mt-3 grid grid-cols-3 gap-1.5">
				<Metric
					icon={Route}
					label="Distance"
					value={`${validation.estimatedDistanceMeters.toFixed(1)} m`}
				/>
				<Metric
					icon={Timer}
					label="Duration"
					value={formatDuration(validation.estimatedDurationSeconds)}
				/>
				<Metric
					icon={BatteryMedium}
					label="Battery"
					value={`-${validation.estimatedBatteryUsePercent.toFixed(1)}%`}
				/>
			</div>

			{validation.issues.length === 0 ? (
				<p className="mt-3 rounded-md border border-emerald-500/20 bg-emerald-500/8 px-2.5 py-2 text-[10px] text-emerald-600 dark:text-emerald-400">
					All safety checks passed. Estimated reserve{' '}
					{validation.estimatedBatteryRemainingPercent.toFixed(0)}%.
				</p>
			) : (
				<ul className="mt-3 grid gap-1.5" aria-label="Validation issues">
					{validation.issues.map((issue) => {
						const Icon = issue.severity === 'error' ? CircleX : AlertTriangle
						return (
							<li key={`${issue.code}-${issue.itemId ?? 'mission'}-${issue.message}`}>
								<button
									className={`flex w-full gap-2 rounded-md border px-2.5 py-2 text-left text-[9px] leading-4 ${
										issue.severity === 'error'
											? 'border-destructive/25 bg-destructive/8 text-destructive'
											: 'border-amber-500/25 bg-amber-500/8 text-amber-600 dark:text-amber-400'
									}`}
									type="button"
									disabled={!issue.itemId}
									onClick={() => issue.itemId && setSelected(issue.itemId)}
								>
									<Icon className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
									<span>
										<strong className="block capitalize">{issue.severity}</strong>
										{issue.message}
									</span>
								</button>
							</li>
						)
					})}
				</ul>
			)}
		</section>
	)
}

function Metric({
	icon: Icon,
	label,
	value,
}: {
	icon: typeof Route
	label: string
	value: string
}) {
	return (
		<div className="min-w-0 rounded-md border border-border bg-muted/55 p-2">
			<Icon className="mb-1 size-3 text-primary" aria-hidden="true" />
			<strong className="block truncate font-mono text-[10px]">{value}</strong>
			<small className="text-[8px] text-muted-foreground uppercase">{label}</small>
		</div>
	)
}

function formatDuration(seconds: number) {
	const minutes = Math.floor(seconds / 60)
	const remainingSeconds = Math.round(seconds % 60)
	return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`
}
