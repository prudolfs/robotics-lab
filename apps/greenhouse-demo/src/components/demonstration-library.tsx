import { useEffect, useState } from 'react'
import type { DemonstrationLibrary as Library } from '../api/use-demonstrations'
import { Button } from './ui/button'
import { Field, FieldGroup, FieldLabel } from './ui/field'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'

export function PlaybackControls({ library }: { library: Library }) {
	const detail = library.selected
	if (!detail) return null
	const episode = detail.entry.episode
	const frame = library.index > 0 ? episode.frames[library.index - 1] : null
	return (
		<section
			aria-label="Recorded episode playback"
			className="flex flex-wrap items-center gap-4 border-border border-b bg-muted px-6 py-3"
		>
			<div className="flex-1">
				<p className="font-medium text-sm">
					Stored-state playback · seed {episode.seed} · {episode.source.replaceAll('_', ' ')}
				</p>
				<p className="text-muted-foreground text-xs">
					Recorded poses at 20 Hz. Actions shown for inspection; playback does not control or
					re-simulate the live robot.
				</p>
				<p data-testid="playback-frame" className="mt-1 text-xs">
					Frame {library.index} / {episode.frames.length} · {frame?.controller ?? 'initial state'}
					{frame?.intervention ? ' · intervention' : ''}
				</p>
				{frame && (
					<p data-testid="recorded-action" className="text-xs">
						Executed action: forward {frame.action.throttle?.toFixed(2)}, turn{' '}
						{frame.action.turn?.toFixed(2)}, lift {frame.action.lift?.toFixed(2)}, grip{' '}
						{frame.action.grip}
					</p>
				)}
				{frame && (
					<details className="mt-1 text-xs">
						<summary>Observation before this action</summary>
						<p>
							Target {frame.observation.target_forward.toFixed(3)} m ahead,{' '}
							{frame.observation.target_left.toFixed(3)} m left; measured speed{' '}
							{frame.observation.speed.toFixed(3)} m/s; lift{' '}
							{frame.observation.lift_height.toFixed(3)} m;{' '}
							{frame.observation.holding ? 'holding' : 'empty'}.
						</p>
						<p>
							Reward {frame.reward.toFixed(3)}; terminated {String(frame.terminated)}; truncated{' '}
							{String(frame.truncated)}.
						</p>
					</details>
				)}
			</div>
			<FieldGroup className="min-w-40 flex-1">
				<Field>
					<FieldLabel htmlFor="playback-position">Episode position</FieldLabel>
					<Input
						id="playback-position"
						type="range"
						min={0}
						max={episode.frames.length}
						value={library.index}
						onChange={(event) => library.seek(Number(event.target.value))}
					/>
				</Field>
			</FieldGroup>
			<Button variant="secondary" onClick={library.toggle}>
				{library.playing ? 'Pause playback' : 'Play recording'}
			</Button>
			<Button variant="outline" onClick={library.close}>
				Return to live
			</Button>
		</section>
	)
}

export function DemonstrationLibrary({
	library,
	connected,
	canReview,
	onReview,
}: {
	library: Library
	connected: boolean
	canReview: boolean
	onReview?: () => void
}) {
	const [note, setNote] = useState('')
	const selected = library.selected?.entry
	useEffect(() => {
		setNote(selected?.review.note ?? '')
	}, [selected])
	const disabled = !connected || library.busy
	return (
		<section
			aria-label="Demonstration library"
			className="flex flex-col gap-5 border-border border-t px-6 py-7"
		>
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h2 className="font-medium text-xl">Demonstrations</h2>
					<p className="mt-1 max-w-2xl text-muted-foreground text-sm">
						Keep the attempts, inspect the actions, and choose what Pip should learn from.
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Button variant="secondary" disabled={disabled} onClick={() => void library.collect()}>
						Collect 20 expert demos
					</Button>
					<Button variant="outline" disabled={disabled} onClick={() => void library.validate()}>
						Validate dataset
					</Button>
					<Button
						variant="outline"
						disabled={disabled || !library.data?.episodes.length}
						onClick={() => void library.download()}
					>
						Export dataset
					</Button>
					<Button variant="ghost" disabled={disabled} onClick={() => void library.refresh()}>
						Refresh library
					</Button>
				</div>
			</div>
			<p data-testid="dataset-message" aria-live="polite" className="text-sm">
				{library.message}
			</p>
			{library.data && (
				<p data-testid="dataset-summary" className="text-muted-foreground text-sm">
					{library.data.episodes.length} episodes · {library.data.total_steps} control steps ·{' '}
					{library.data.eligible_train} reviewed training episodes
				</p>
			)}
			{!canReview && (
				<p className="text-muted-foreground text-xs">
					Pause collection and finish recording before loading a saved demonstration.
				</p>
			)}
			<div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(240px,1fr)]">
				<div className="max-h-80 overflow-auto rounded-lg border border-border">
					<table className="w-full text-left text-sm">
						<caption className="sr-only">Recorded demonstrations and their review state</caption>
						<thead className="sticky top-0 bg-background">
							<tr className="border-border border-b">
								<th className="p-3">Seed / source</th>
								<th className="p-3">Outcome / split</th>
								<th className="p-3">Review</th>
								<th className="p-3">
									<span className="sr-only">Load</span>
								</th>
							</tr>
						</thead>
						<tbody>
							{library.data?.episodes.map((episode) => (
								<tr
									key={episode.episode_id}
									data-testid={`episode-${episode.episode_id}`}
									className="border-border border-b last:border-0"
								>
									<td className="p-3">
										{episode.seed} · {episode.source.replaceAll('_', ' ')}
										<p className="text-muted-foreground text-xs">
											{episode.steps} steps · {episode.interventions} interventions
										</p>
									</td>
									<td className="p-3">
										{episode.outcome}
										<p className="text-muted-foreground text-xs">{episode.split}</p>
									</td>
									<td className="p-3">
										{(episode.review.label ?? 'unreviewed').replaceAll('_', ' ')}
										<p className="text-muted-foreground text-xs">
											{episode.review.excluded ? 'Excluded' : 'Included'}
										</p>
									</td>
									<td className="p-3">
										<Button
											size="sm"
											variant="outline"
											disabled={disabled || !canReview}
											onClick={() => {
												onReview?.()
												void library.load(episode.episode_id)
												document
													.getElementById('greenhouse-view')
													?.scrollIntoView({ behavior: 'instant' })
											}}
										>
											Review seed {episode.seed}
										</Button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
					{!library.data?.episodes.length && (
						<p className="p-4 text-muted-foreground text-sm">
							No demonstrations yet. Record a live attempt or collect the scripted expert batch.
						</p>
					)}
				</div>
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor="dataset-import">
							Import demonstrations (JSON, up to 20 MiB)
						</FieldLabel>
						<Input
							id="dataset-import"
							type="file"
							accept="application/json,.json"
							disabled={disabled}
							onChange={(event) => {
								const file = event.target.files?.[0]
								if (file) void library.import(file)
								event.target.value = ''
							}}
						/>
					</Field>
					{selected && (
						<>
							<p className="text-sm">
								Reviewing seed {selected.episode.seed}: {selected.episode.outcome}. Raw episode{' '}
								{selected.sha256.slice(0, 12)}…
							</p>
							<Field>
								<FieldLabel htmlFor="review-note">Review note</FieldLabel>
								<Textarea
									id="review-note"
									maxLength={500}
									value={note}
									onChange={(event) => setNote(event.target.value)}
								/>
							</Field>
							<div className="flex flex-wrap gap-2">
								<Button
									size="sm"
									disabled={
										disabled ||
										selected.episode.outcome !== 'success' ||
										selected.episode.final_state.invalid_actions > 0 ||
										selected.episode.final_state.collisions > 0
									}
									onClick={() => void library.review({ label: 'usable', excluded: false, note })}
								>
									Mark usable
								</Button>
								<Button
									size="sm"
									variant="secondary"
									disabled={disabled}
									onClick={() => void library.review({ label: 'needs_work', excluded: true, note })}
								>
									Needs work
								</Button>
								<Button
									size="sm"
									variant="outline"
									disabled={disabled}
									onClick={() =>
										void library.review({
											...selected.review,
											excluded: !selected.review.excluded,
											note,
										})
									}
								>
									{selected.review.excluded ? 'Include episode' : 'Exclude episode'}
								</Button>
								<Button
									size="sm"
									variant="outline"
									disabled={disabled}
									onClick={() => void library.review({ ...selected.review, note })}
								>
									Save note
								</Button>
								<Button
									size="sm"
									variant="ghost"
									disabled={disabled}
									onClick={() => void library.download(selected.episode.episode_id)}
								>
									Export episode
								</Button>
							</div>
						</>
					)}
				</FieldGroup>
			</div>
			{library.validation && (
				<div data-testid="dataset-validation" className="text-sm">
					<p>
						{library.validation.ready_for_training
							? 'Ready for the first training run'
							: 'Dataset is not ready for training'}
						: {library.validation.eligible_train_ids.length} eligible episodes;{' '}
						{library.validation.errors.length} errors; {library.validation.skipped.length} skipped.
					</p>
					{library.validation.errors.map((error) => (
						<p key={error} className="text-destructive">
							{error}
						</p>
					))}
					{library.validation.skipped.length > 0 && (
						<details className="mt-2">
							<summary>Why episodes were skipped</summary>
							<ul className="mt-2 flex flex-col gap-1">
								{library.validation.skipped.map((item) => (
									<li key={item}>{item}</li>
								))}
							</ul>
						</details>
					)}
				</div>
			)}
			{library.data && (
				<p className="break-all text-muted-foreground text-xs">
					Local artifacts: {library.data.artifact_location}. Source episodes are immutable; reviews
					are separate. Training seeds 0–99, validation 10000–10029, final test 20000–20099
					reserved. Storage: {library.data.max_episodes} episodes / 256 MiB.
				</p>
			)}
		</section>
	)
}
