import { useMemo, useState } from 'react'
import type { TrainingState } from '../api/use-training'
import { ChoiceOption, ChoiceSelect } from './choice-select'
import { DataGrid, type GridColumn } from './data-grid'
import { LearningChart } from './learning-chart'
import { Button } from './ui/button'
import { Field, FieldGroup, FieldLabel } from './ui/field'
import { Input } from './ui/input'

export function TrainingPlayback({ training }: { training: TrainingState }) {
	if (!training.rollout || !training.scene) return null
	return (
		<section
			aria-label="Validation rollout playback"
			className="flex flex-wrap items-center gap-4 border-border border-b bg-muted px-6 py-3"
		>
			<div className="flex-1">
				<p className="font-medium text-sm">
					Stored validation rollout · seed {training.rollout.seed} · learned checkpoint{' '}
					{training.selectedId.slice(-2)}
				</p>
				<p className="text-muted-foreground text-xs">
					Recorded policy execution; playback sends no live actions.{' '}
					{training.rollout.success ? 'Delivered' : training.rollout.failure.replaceAll('_', ' ')} ·{' '}
					{training.rollout.invalid_actions} invalid actions.
				</p>
				<p data-testid="validation-frame" className="text-xs">
					Frame {training.index} / {training.rollout.frames?.length ?? 0}
				</p>
			</div>
			<FieldGroup className="min-w-40 flex-1">
				<Field>
					<FieldLabel htmlFor="validation-position">Validation position</FieldLabel>
					<Input
						id="validation-position"
						type="range"
						min={0}
						max={training.rollout.frames?.length ?? 0}
						value={training.index}
						onChange={(event) => training.seek(Number(event.target.value))}
					/>
				</Field>
			</FieldGroup>
			<Button variant="secondary" onClick={training.toggleReplay}>
				{training.playing ? 'Pause validation playback' : 'Play validation rollout'}
			</Button>
			<Button variant="outline" onClick={training.closeReplay}>
				Return to live
			</Button>
		</section>
	)
}

export function TrainingPanel({
	training,
	connected,
	eligible,
	canUse,
	canReview,
	onUse,
	onReplay,
}: {
	training: TrainingState
	connected: boolean
	eligible: number
	canUse: boolean
	canReview: boolean
	onUse: () => void
	onReplay: (seed: number) => void
}) {
	const [epochs, setEpochs] = useState(120)
	const [corrections, setCorrections] = useState(3)
	const job = training.data?.jobs.find((item) => item.request.algorithm === 'bc')
	const checkpoint = training.detail?.checkpoint
	const disabled = !connected || training.busy
	const valid =
		Number.isInteger(epochs) &&
		epochs >= 10 &&
		epochs <= 300 &&
		Number.isInteger(corrections) &&
		corrections >= 0 &&
		corrections <= 3
	const candidates = (training.data?.checkpoints ?? [])
		.filter((item) => item.job_id === (checkpoint?.job_id ?? job?.job_id))
		.sort((a, b) => a.round - b.round)
	return (
		<section
			aria-label="Imitation learning"
			className="flex flex-col gap-5 border-border border-t p-4"
		>
			<div className="flex flex-wrap justify-between gap-4">
				<div>
					<h2 className="font-medium text-lg">Teach, train, then watch</h2>
					<p className="mt-1 max-w-2xl text-muted-foreground text-sm">
						Clone reviewed demonstrations, measure whole-task performance, and inspect where the
						learned policy struggles.
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Button
						disabled={disabled || !!training.data?.active_job || eligible === 0 || !valid}
						onClick={() =>
							void training.start({
								epochs,
								correction_rounds: corrections,
								random_seed: 7,
								budget_seconds: 180,
							})
						}
					>
						Train policy
					</Button>
					<Button
						variant="outline"
						disabled={disabled || !training.active || training.active.cancel_requested}
						onClick={() => void training.cancel()}
					>
						{training.active?.cancel_requested ? 'Cancellation requested' : 'Cancel training'}
					</Button>
				</div>
			</div>
			<FieldGroup className="grid grid-cols-1 gap-4">
				<Field>
					<FieldLabel htmlFor="training-epochs">Epochs per round (10–300)</FieldLabel>
					<Input
						id="training-epochs"
						type="number"
						min={10}
						max={300}
						value={epochs}
						onChange={(event) => setEpochs(Number(event.target.value))}
						disabled={disabled || !!training.active}
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor="correction-rounds">Expert correction rounds (0–3)</FieldLabel>
					<Input
						id="correction-rounds"
						type="number"
						min={0}
						max={3}
						value={corrections}
						onChange={(event) => setCorrections(Number(event.target.value))}
						disabled={disabled || !!training.active}
					/>
				</Field>
				<Field className="">
					<FieldLabel htmlFor="policy-checkpoint">Saved checkpoint</FieldLabel>
					<ChoiceSelect
						id="policy-checkpoint"
						value={training.selectedId}
						onValueChange={training.choose}
						disabled={disabled || !training.data?.checkpoints.length}
					>
						<ChoiceOption value="">No evaluated checkpoint yet</ChoiceOption>
						{training.data?.checkpoints.map((item) => (
							<ChoiceOption
								key={item.checkpoint_id}
								value={item.checkpoint_id}
								disabled={!item.compatible}
							>
								{item.algorithm?.toUpperCase()} {item.job_id.slice(0, 8)} · round {item.round} ·{' '}
								{item.evaluation.clean_successes}
								/30 clean{item.compatible ? '' : ' · incompatible'}
							</ChoiceOption>
						))}
					</ChoiceSelect>
				</Field>
			</FieldGroup>
			<p className="text-muted-foreground text-xs">
				{eligible} eligible episodes. One CPU worker, initialization seed 7, 180 s budget.
				Corrections label learner-visited training states; expert actions never replace the learner
				during evaluation or live execution.
			</p>
			<p data-testid="training-message" aria-live="polite" className="text-sm">
				{training.message}
			</p>
			{job && (
				<div className="grid grid-cols-1 gap-5">
					<div className="flex flex-col gap-2">
						<p data-testid="training-status" className="font-medium text-sm">
							Imitation fit: {job.state} · {job.phase} · round {job.round} · epoch {job.epoch}
						</p>
						<p className="text-muted-foreground text-sm">{job.message}</p>
						<p className="text-muted-foreground text-xs">
							Elapsed {job.elapsed_seconds?.toFixed(1)} s · fitting loss{' '}
							{job.fitting_loss?.toFixed(4) ?? 'not measured yet'} · worker peak{' '}
							{job.peak_worker_rss_mb ? `${job.peak_worker_rss_mb.toFixed(0)} MiB` : 'pending'}
						</p>
						<p className="text-muted-foreground text-xs">
							Loss measures label fit. Delivery and clean-delivery rates come from full validation
							episodes. Validation selects checkpoints; final-test seeds remain reserved.
						</p>
					</div>
					<LearningChart job={job} />
				</div>
			)}
			{checkpoint && (
				<>
					<div
						data-testid="policy-score"
						className="flex flex-wrap items-center justify-between gap-4"
					>
						<p className="font-medium">
							Learned: {checkpoint.evaluation.successes}/30 delivered,{' '}
							{checkpoint.evaluation.clean_successes}/30 clean. Reference:{' '}
							{checkpoint.reference.clean_successes}/30 clean.
						</p>
						<Button
							variant="secondary"
							disabled={disabled || !canUse || !checkpoint.compatible}
							onClick={onUse}
						>
							Use selected checkpoint
						</Button>
					</div>
					<p className="text-muted-foreground text-sm">
						{checkpoint.evaluation.collisions} collisions · {checkpoint.evaluation.invalid_actions}{' '}
						invalid actions · {checkpoint.training_samples} labeled states (
						{checkpoint.correction_samples} corrective inherited labels). Artifact identity{' '}
						{checkpoint.training_sha256.slice(0, 12)}…
					</p>
					<CandidateGrid candidates={candidates} selectedId={training.selectedId} />
					<p className="text-muted-foreground text-sm">
						Outcomes:{' '}
						{Object.entries(checkpoint.evaluation.failure_counts)
							.map(([kind, count]) => `${kind.replaceAll('_', ' ')} ${count}`)
							.join('; ')}
						.
					</p>
					<div className="flex flex-wrap gap-2">
						{training.detail?.evaluation.episodes
							.filter((item) => (item.frames?.length ?? 0) > 0)
							.map((item) => (
								<Button
									key={item.seed}
									aria-label={`Review validation seed ${item.seed}`}
									size="sm"
									variant="outline"
									disabled={!canReview}
									onClick={() => onReplay(item.seed)}
								>
									Review validation seed {item.seed}
									<span className="text-muted-foreground">
										{item.success ? ' · delivered' : ` · ${item.failure.replaceAll('_', ' ')}`}
									</span>
								</Button>
							))}
					</div>
					<p className="break-all text-muted-foreground text-xs">
						Checkpoint {checkpoint.checkpoint_id} · {checkpoint.policy_version} ·{' '}
						{checkpoint.architecture}. Local artifacts: {training.data?.artifact_location}
					</p>
				</>
			)}
		</section>
	)
}

function CandidateGrid({
	candidates,
	selectedId,
}: {
	candidates: NonNullable<TrainingState['data']>['checkpoints']
	selectedId: string
}) {
	type Candidate = (typeof candidates)[number]
	const columns = useMemo<GridColumn<Candidate>[]>(
		() => [
			{ id: 'round', header: 'Round', value: (item) => item.round, cell: (item) => item.round },
			{
				id: 'fit',
				header: 'Fit / steps',
				value: (item) =>
					item.algorithm === 'ppo' ? (item.practice_steps ?? 0) : item.fitting_loss,
				cell: (item) =>
					item.algorithm === 'ppo' ? item.practice_steps : item.fitting_loss.toFixed(4),
			},
			{
				id: 'delivered',
				header: 'Delivered',
				value: (item) => item.evaluation.successes,
				cell: (item) => `${item.evaluation.successes}/30`,
			},
			{
				id: 'clean',
				header: 'Clean',
				value: (item) => item.evaluation.clean_successes,
				cell: (item) => `${item.evaluation.clean_successes}/30`,
			},
			{
				id: 'invalid',
				header: 'Invalid',
				value: (item) => item.evaluation.invalid_actions,
				cell: (item) => item.evaluation.invalid_actions,
			},
		],
		[],
	)
	return (
		<DataGrid
			data={candidates}
			columns={columns}
			label="checkpoint rounds"
			rowId={(item) => item.checkpoint_id}
			selectedId={selectedId}
			search={false}
		/>
	)
}
