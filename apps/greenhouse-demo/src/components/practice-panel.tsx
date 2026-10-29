import { useMemo } from 'react'
import type { ComparisonState } from '../api/use-comparison'
import type { TrainingState } from '../api/use-training'
import { useWorkspace } from '../state/workspace'
import { ChoiceOption, ChoiceSelect } from './choice-select'
import { DataGrid, type GridColumn } from './data-grid'
import { Button } from './ui/button'
import { Field, FieldGroup, FieldLabel } from './ui/field'
import { Input } from './ui/input'

export function PracticePanel({
	training,
	comparison,
	connected,
	canReview,
	onCompare,
}: {
	training: TrainingState
	comparison: ComparisonState
	connected: boolean
	canReview: boolean
	onCompare: (seed: number, checkpoints: string[]) => void
}) {
	const first = useWorkspace((state) => state.comparisonA)
	const setFirst = (id: string) => useWorkspace.getState().compareWith('a', id)
	const second = useWorkspace((state) => state.comparisonB)
	const setSecond = (id: string) => useWorkspace.getState().compareWith('b', id)
	const seed = useWorkspace((state) => state.comparisonSeed)
	const setSeed = useWorkspace.getState().setComparisonSeed
	const checkpoints = training.data?.checkpoints.filter((item) => item.compatible) ?? []
	const parent =
		checkpoints.find((item) => item.algorithm === 'bc' && item.round === 3) ??
		checkpoints.find((item) => item.algorithm === 'bc')
	const practiced = checkpoints
		.filter((item) => item.algorithm === 'ppo' && (item.practice_steps ?? 0) > 0)
		.sort(
			(a, b) =>
				b.evaluation.clean_successes - a.evaluation.clean_successes ||
				b.evaluation.successes - a.evaluation.successes ||
				a.evaluation.invalid_actions - b.evaluation.invalid_actions ||
				a.evaluation.mean_seconds - b.evaluation.mean_seconds,
		)[0]
	const a = first || parent?.checkpoint_id || ''
	const b = second || practiced?.checkpoint_id || ''
	const job = training.data?.jobs.find((item) => item.request.algorithm === 'ppo')
	const selected = training.detail?.checkpoint
	const point = job?.practice_history?.at(-1)
	return (
		<section
			aria-label="Reinforcement learning and comparison"
			className="flex flex-col gap-5 border-border border-t p-4"
		>
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h2 className="font-medium text-lg">Practice, then compare</h2>
					<p className="mt-1 max-w-2xl text-muted-foreground text-sm">
						PPO practices from an imitation checkpoint. Compare complete episodes; keep the
						imitation policy when practice regresses.
					</p>
				</div>
				<Button
					disabled={
						!connected || training.busy || !!training.active || selected?.algorithm !== 'bc'
					}
					onClick={() =>
						void training.start({
							algorithm: 'ppo',
							parent_checkpoint: training.selectedId,
							ppo_steps: 36864,
							random_seed: 7,
							budget_seconds: 240,
						})
					}
				>
					Practice selected imitation policy
				</Button>
			</div>
			<p className="text-muted-foreground text-xs">
				Select a BC checkpoint in Train to initialize practice. One CPU worker, 36,864 steps, 240 s
				budget. Near pickup → full placement → peripheral pots. Final-test scenarios are reserved
				for the sealed evaluation command.
			</p>
			{job && (
				<div className="flex flex-col gap-2 text-sm" aria-live="polite">
					<p>
						PPO {job.state} · {job.practice_steps ?? 0} / {job.request.ppo_steps} steps ·{' '}
						{(job.elapsed_seconds ?? 0).toFixed(1)} s · peak{' '}
						{(job.peak_worker_rss_mb ?? 0).toFixed(0)} MiB
					</p>
					<p className="break-all text-muted-foreground text-xs">
						{job.message} Selected: {job.selected_checkpoint ?? 'awaiting validation'}.
					</p>
					{point && (
						<>
							<p>
								Latest training batch: {point.stage} · {point.deliveries}/{point.completed_episodes}{' '}
								completed episodes delivered · policy loss {point.policy_loss.toFixed(4)} · value
								loss {point.value_loss.toFixed(4)} · KL {point.approximate_kl.toFixed(4)}
							</p>
							<p className="text-muted-foreground text-xs">
								Batch reward components:{' '}
								{Object.entries(point.reward_components)
									.map(([key, value]) => `${key} ${value.toFixed(2)}`)
									.join(' · ')}
								. Training reward and stochastic outcomes are separate from deterministic validation
								success.
							</p>
						</>
					)}
				</div>
			)}
			<FieldGroup className="grid grid-cols-1 gap-4">
				{[
					{ label: 'Comparison policy A', value: a, set: setFirst },
					{ label: 'Comparison policy B', value: b, set: setSecond },
				].map(({ label, value, set }) => (
					<Field key={label}>
						<FieldLabel htmlFor={label.replaceAll(' ', '-')}>{label}</FieldLabel>
						<ChoiceSelect id={label.replaceAll(' ', '-')} value={value} onValueChange={set}>
							<ChoiceOption value="">Choose checkpoint</ChoiceOption>
							{checkpoints.map((item) => (
								<ChoiceOption key={item.checkpoint_id} value={item.checkpoint_id}>
									{item.algorithm?.toUpperCase()} {item.checkpoint_id.slice(0, 8)} r{item.round} ·{' '}
									{item.evaluation.clean_successes}/30 clean
								</ChoiceOption>
							))}
						</ChoiceSelect>
					</Field>
				))}
				<Field>
					<FieldLabel htmlFor="comparison-seed">Comparison seed (10000–10029)</FieldLabel>
					<Input
						id="comparison-seed"
						type="number"
						min={10000}
						max={10029}
						value={seed}
						onChange={(event) => setSeed(Number(event.target.value))}
					/>
				</Field>
			</FieldGroup>
			<Button
				className="self-start"
				disabled={
					!connected ||
					!canReview ||
					comparison.busy ||
					!a ||
					!b ||
					a === b ||
					!Number.isInteger(seed) ||
					seed < 10000 ||
					seed > 10029
				}
				onClick={() => onCompare(seed, [a, b])}
			>
				{comparison.busy ? 'Measuring policies…' : 'Compare policies'}
			</Button>
			<p className="text-muted-foreground text-xs">
				Pause the live world before comparing. Both checkpoints and the reference run independently
				from the same seeded initial state. Playback uses recorded states and sends no live actions.
			</p>
			{comparison.error && (
				<p role="alert" className="text-sm">
					{comparison.error}
				</p>
			)}
			{comparison.data && <ComparisonGrid comparison={comparison} canReview={canReview} />}
		</section>
	)
}

export function ComparisonPlayback({ comparison }: { comparison: ComparisonState }) {
	if (!comparison.scene || !comparison.current) return null
	return (
		<section
			aria-label="Comparison playback"
			className="flex flex-wrap items-center gap-4 border-border border-b bg-muted px-6 py-3"
		>
			<div className="min-w-0 flex-1">
				<p className="font-medium text-sm">
					Stored comparison · seed {comparison.data?.seed} · {comparison.current.label}
				</p>
				<p className="text-muted-foreground text-xs">
					Recorded states; no live actions. Frame {comparison.index} /{' '}
					{comparison.current.rollout.frames?.length ?? 0}
				</p>
			</div>
			<Field className="min-w-40 flex-1">
				<FieldLabel htmlFor="comparison-position">Comparison position</FieldLabel>
				<Input
					id="comparison-position"
					type="range"
					min={0}
					max={comparison.current.rollout.frames?.length ?? 0}
					value={comparison.index}
					onChange={(event) => comparison.seek(Number(event.target.value))}
				/>
			</Field>
			<Button variant="secondary" onClick={comparison.toggle}>
				{comparison.playing ? 'Pause comparison playback' : 'Play comparison rollout'}
			</Button>
			<Button variant="outline" onClick={comparison.close}>
				Return to live
			</Button>
		</section>
	)
}

function ComparisonGrid({
	comparison,
	canReview,
}: {
	comparison: ComparisonState
	canReview: boolean
}) {
	type Entry = NonNullable<ComparisonState['data']>['entries'][number]
	const entries = comparison.data?.entries ?? emptyComparisons
	const columns = useMemo<GridColumn<Entry>[]>(
		() => [
			{
				id: 'controller',
				header: 'Controller',
				value: (item) => item.label,
				cell: (item) => item.label,
			},
			{
				id: 'outcome',
				header: 'Outcome',
				value: (item) => item.rollout.failure,
				cell: (item) =>
					item.rollout.success
						? item.rollout.clean_success
							? 'Clean delivery'
							: 'Delivered with rejected actions'
						: item.rollout.failure.replaceAll('_', ' '),
			},
			{
				id: 'seconds',
				header: 'Seconds',
				value: (item) => item.rollout.seconds,
				cell: (item) => item.rollout.seconds.toFixed(2),
			},
			{
				id: 'invalid',
				header: 'Invalid',
				value: (item) => item.rollout.invalid_actions,
				cell: (item) => item.rollout.invalid_actions,
			},
			{
				id: 'watch',
				header: 'Playback',
				value: () => '',
				sort: false,
				cell: (item) => (
					<Button
						size="sm"
						variant="outline"
						disabled={!canReview}
						onClick={() => comparison.choose(entries.indexOf(item))}
					>
						Watch {entries.indexOf(item) + 1}
					</Button>
				),
			},
		],
		[canReview, comparison.choose, entries],
	)
	return (
		<div>
			<p className="mb-3 text-sm">Same-scenario outcomes · seed {comparison.data?.seed}</p>
			<DataGrid
				data={entries}
				columns={columns}
				label="comparison outcomes"
				rowId={(item) => item.label}
				search={false}
			/>
		</div>
	)
}
const emptyComparisons: NonNullable<ComparisonState['data']>['entries'] = []
