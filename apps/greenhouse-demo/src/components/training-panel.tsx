import { useState } from 'react'
import type { TrainingState } from '../api/use-training'
import { Button } from './ui/button'
import { Field, FieldGroup, FieldLabel } from './ui/field'
import { Input } from './ui/input'
import { NativeSelect, NativeSelectOption } from './ui/native-select'

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
	const history = job?.history ?? []
	const maxLoss = Math.max(0.1, ...history.map((point) => point.loss))
	const totalEpochs = (job?.request.epochs ?? 120) * ((job?.request.correction_rounds ?? 3) + 1)
	const groups = [0, 1, 2, 3].map((round) => history.filter((point) => point.round === round))
	return (
		<section
			aria-label="Imitation learning"
			className="flex flex-col gap-5 border-border border-t px-6 py-7"
		>
			<div className="flex flex-wrap justify-between gap-4">
				<div>
					<h2 className="font-medium text-xl">Teach, train, then watch</h2>
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
			<FieldGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
				<Field className="sm:col-span-2">
					<FieldLabel htmlFor="policy-checkpoint">Saved checkpoint</FieldLabel>
					<NativeSelect
						id="policy-checkpoint"
						value={training.selectedId}
						onChange={(event) => training.choose(event.target.value)}
						disabled={disabled || !training.data?.checkpoints.length}
					>
						<NativeSelectOption value="">No evaluated checkpoint yet</NativeSelectOption>
						{training.data?.checkpoints.map((item) => (
							<NativeSelectOption
								key={item.checkpoint_id}
								value={item.checkpoint_id}
								disabled={!item.compatible}
							>
								{item.algorithm?.toUpperCase()} {item.job_id.slice(0, 8)} · round {item.round} ·{' '}
								{item.evaluation.clean_successes}
								/30 clean{item.compatible ? '' : ' · incompatible'}
							</NativeSelectOption>
						))}
					</NativeSelect>
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
				<div className="grid gap-5 lg:grid-cols-2">
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
					<figure className="min-w-0">
						<svg
							viewBox="0 0 480 130"
							role="img"
							aria-labelledby="loss-title"
							className="h-32 w-full"
						>
							<title id="loss-title">
								Supervised fitting loss by epoch, separated by correction round
							</title>
							<path d="M30 8V108H470" fill="none" stroke="currentColor" opacity="0.3" />
							{groups.map(
								(points, round) =>
									points.length > 0 && (
										<polyline
											key={points[0].round}
											points={points
												.map(
													(point) =>
														`${30 + ((round * (job.request.epochs ?? 120) + point.epoch) / totalEpochs) * 430},${105 - (point.loss / maxLoss) * 92}`,
												)
												.join(' ')}
											fill="none"
											stroke="var(--primary)"
											strokeWidth="2"
										/>
									),
							)}
							<text x="30" y="125" fill="currentColor" fontSize="10">
								Epochs across rounds
							</text>
							<text x="32" y="10" fill="currentColor" fontSize="10">
								Loss
							</text>
						</svg>
						<figcaption className="text-muted-foreground text-xs">
							Each round adds data; compare task outcomes alongside the loss curve.
						</figcaption>
					</figure>
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
					<div className="overflow-auto">
						<table className="w-full text-left text-sm">
							<caption className="sr-only">Evaluated checkpoint rounds</caption>
							<thead>
								<tr className="border-border border-b">
									<th className="p-2">Round</th>
									<th className="p-2">
										{checkpoint.algorithm === 'ppo' ? 'Practice steps' : 'Fitting loss'}
									</th>
									<th className="p-2">Delivered</th>
									<th className="p-2">Clean</th>
									<th className="p-2">Invalid</th>
								</tr>
							</thead>
							<tbody>
								{candidates.map((item) => (
									<tr key={item.checkpoint_id}>
										<td className="p-2">{item.round}</td>
										<td className="p-2">
											{item.algorithm === 'ppo'
												? item.practice_steps
												: item.fitting_loss.toFixed(4)}
										</td>
										<td className="p-2">{item.evaluation.successes}/30</td>
										<td className="p-2">{item.evaluation.clean_successes}/30</td>
										<td className="p-2">{item.evaluation.invalid_actions}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
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
									size="sm"
									variant="outline"
									disabled={!canReview}
									onClick={() => onReplay(item.seed)}
								>
									Review validation seed {item.seed}
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
