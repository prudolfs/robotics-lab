import { useId, useState } from 'react'
import type { Scene } from '../api/client'
import type { TrainingJob } from '../api/training'
import { useWorkspace } from '../state/workspace'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card'

export function ObservationInspector({
	scene,
	practice,
}: {
	scene: Scene
	practice?: TrainingJob
}) {
	const [open, setOpen] = useState(false)
	const id = useId()
	const replay = useWorkspace((state) => state.replay)
	const index = useWorkspace((state) => state.frame)
	const frame = replay.kind === 'episode' ? replay.detail.entry.episode.frames[index - 1] : null
	const batch = practice?.practice_history?.at(-1)
	return (
		<Card size="sm">
			<CardHeader>
				<CardTitle>Observation and reward inspector</CardTitle>
				<CardDescription>
					Idealized robot-local measurements. Robot-eye images are not policy inputs.
				</CardDescription>
				<Button
					variant="outline"
					size="sm"
					aria-expanded={open}
					aria-controls={id}
					onClick={() => setOpen(!open)}
				>
					{' '}
					{open ? 'Hide learning details' : 'Inspect observations and rewards'}{' '}
				</Button>
			</CardHeader>
			<CardContent id={id} hidden={!open} className="flex flex-col gap-4">
				<dl aria-label="Policy observations" className="grid grid-cols-2 gap-2 text-xs">
					{Object.entries(scene.observation).map(([key, value]) => (
						<div key={key} className="contents">
							<dt className="text-muted-foreground">{key.replaceAll('_', ' ')}</dt>
							<dd>{typeof value === 'number' ? value.toFixed(4) : String(value)}</dd>
						</div>
					))}
				</dl>
				{frame && (
					<div className="flex flex-col gap-2 text-xs">
						<p>
							Recorded control step {frame.tick} · reward {frame.reward.toFixed(4)}
						</p>
						<p>
							Executed action: throttle {frame.action.throttle}, turn {frame.action.turn}, lift{' '}
							{frame.action.lift}, grip {frame.action.grip}.
						</p>
						<p>
							Recorded reward belongs to this demonstration step; it is not PPO training reward.
						</p>
					</div>
				)}
				<div className="flex flex-col gap-2 text-xs">
					<p className="font-medium">Latest PPO training batch</p>
					{batch ? (
						<>
							<p>
								{practice?.job_id.slice(0, 8)} · {batch.stage} · {practice?.state}. Aggregate
								components from the saved training batch, not the displayed live step.
							</p>
							<dl aria-label="Training batch reward" className="grid grid-cols-2 gap-2">
								{Object.entries(batch.reward_components).map(([key, value]) => (
									<div key={key} className="contents">
										<dt className="text-muted-foreground">{key.replaceAll('_', ' ')}</dt>
										<dd>{value.toFixed(4)}</dd>
									</div>
								))}
							</dl>
						</>
					) : (
						<p>No saved PPO batch yet. Live inference does not optimize a reward.</p>
					)}
				</div>
			</CardContent>
			{open && (
				<CardFooter>
					<p className="text-muted-foreground text-xs">
						Distances are metres, bearing is radians, speeds are m/s and rad/s. Policy normalization
						and the constrained grasp are documented in the project guide.
					</p>
				</CardFooter>
			)}
		</Card>
	)
}
