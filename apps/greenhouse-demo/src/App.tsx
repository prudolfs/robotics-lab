import { useState } from 'react'
import { useComparison } from './api/use-comparison'
import { useDemonstrations } from './api/use-demonstrations'
import { useMissions } from './api/use-missions'
import { useSession } from './api/use-session'
import { useTraining } from './api/use-training'
import { DemonstrationLibrary, PlaybackControls } from './components/demonstration-library'
import { type CameraMode, GreenhouseScene } from './components/greenhouse-scene'
import { MissionPanel } from './components/mission-panel'
import { ComparisonPlayback, PracticePanel } from './components/practice-panel'
import { TeachingControls } from './components/teaching-controls'
import { TrainingPanel, TrainingPlayback } from './components/training-panel'
import { Button } from './components/ui/button'
import { ToggleGroup, ToggleGroupItem } from './components/ui/toggle-group'
import { useCaretakerSound } from './components/use-caretaker-sound'

const stageLabels = {
	approach: 'Approaching the capsule',
	grasp: 'Securing the capsule',
	lift: 'Lifting for travel',
	deliver: 'Carrying to the tray',
	lower: 'Lowering the capsule',
	release: 'Releasing into the tray',
	done: 'Delivery complete',
	manual: 'Manual teaching',
	learned: 'Learned policy acting',
	docking: 'Returning to the dock',
	aligning: 'Scripted heading alignment',
}

export function App() {
	const connection = useSession()
	const [cameraMode, setCameraMode] = useState<CameraMode>('overview')
	const connected = connection.status === 'connected'
	const library = useDemonstrations(connected, connection.session?.last_episode_id)
	const training = useTraining(connected)
	const comparison = useComparison()
	const missions = useMissions(connected, connection.session)
	const liveMission = connection.session?.mission
	const playback = !!library.selected || !!training.scene || !!comparison.scene
	const liveScene = connection.session?.scene
	const scene = library.scene ?? comparison.scene ?? training.scene ?? liveScene
	const sound = useCaretakerSound(
		playback ? undefined : liveScene,
		playback ? -1 : (connection.session?.generation ?? 0),
	)
	const running = scene?.status === 'running'
	const terminal = scene?.status === 'complete' || scene?.status === 'failed'
	const disabled = !connected || connection.pending || playback
	return (
		<main className="flex min-h-screen flex-col bg-background text-foreground">
			<header className="flex flex-wrap items-center justify-between gap-4 border-border border-b px-6 py-5">
				<div>
					<h1 className="font-medium text-xl">Greenhouse Caretaker</h1>
					<p className="mt-1 text-muted-foreground text-sm">
						A small robot learning to lend a hand.
					</p>
				</div>
				<p className="text-muted-foreground text-sm">Robotics Lab · Phase 7</p>
			</header>
			<PlaybackControls library={library} />
			<TrainingPlayback training={training} />
			<ComparisonPlayback comparison={comparison} />
			<div
				id="greenhouse-view"
				className="flex min-h-[580px] flex-col lg:h-[calc(100vh-128px)] lg:flex-row"
			>
				<GreenhouseScene
					scene={scene ?? null}
					generation={
						library.selected
							? library.generation
							: comparison.scene
								? comparison.generation
								: training.scene
									? training.generation
									: (connection.session?.generation ?? 0)
					}
					cameraMode={cameraMode}
				/>
				<aside
					aria-label="Caretaker session"
					className="flex w-full flex-col gap-5 border-border border-t p-6 lg:w-80 lg:shrink-0 lg:overflow-y-auto lg:border-t-0 lg:border-l"
				>
					<div>
						<h2 className="font-medium text-lg">A little help in the greenhouse</h2>
						<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
							Collect the fallen seed capsule and place it in the collection tray.
						</p>
					</div>
					<div className="flex flex-col gap-1">
						<p data-testid="connection-status" className="text-sm" aria-live="polite">
							{connected
								? 'Connected'
								: connection.status === 'connecting'
									? 'Connecting…'
									: connection.status === 'error'
										? 'Connection error'
										: 'Server unavailable'}
						</p>
						<p role="status" className="text-muted-foreground text-xs leading-relaxed">
							{connection.message}
						</p>
						{!connected && connection.status !== 'connecting' && (
							<p className="text-muted-foreground text-sm">
								Run <code>pnpm dev:greenhouse</code> from the repository, then retry.
							</p>
						)}
					</div>
					<div className="flex flex-col gap-2">
						<h3 className="font-medium text-sm">Controller</h3>
						<ToggleGroup
							aria-label="Controller mode"
							variant="outline"
							size="sm"
							className="max-w-full flex-wrap"
							value={[scene?.controller ?? 'scripted_reference']}
							disabled={disabled || !!liveMission || liveScene?.status === 'running' || terminal}
							onValueChange={(value) => {
								if (value[0] === 'learned_policy' && training.selectedId)
									connection.setController('learned_policy', training.selectedId)
								else if (value[0] === 'manual' || value[0] === 'scripted_reference')
									connection.setController(value[0])
							}}
						>
							<ToggleGroupItem value="scripted_reference">Reference</ToggleGroupItem>
							<ToggleGroupItem value="manual">Teach manually</ToggleGroupItem>
							<ToggleGroupItem
								value="learned_policy"
								disabled={!training.detail?.checkpoint.compatible}
							>
								Learned
							</ToggleGroupItem>
						</ToggleGroup>
						<p className="text-muted-foreground text-xs">
							Pause before changing controller. New seeds stay in the training range 0–99.
						</p>
					</div>
					{connection.session?.controller_error && (
						<p className="text-destructive text-xs">{connection.session.controller_error}</p>
					)}
					<div className="flex flex-col gap-3">
						<Button
							disabled={disabled || missions.busy || !scene || terminal}
							onClick={() =>
								liveMission
									? void missions.control(liveMission.state === 'paused' ? 'resume' : 'pause')
									: connection.command(running ? 'pause' : 'start')
							}
						>
							{liveMission
								? `Mission ${liveMission.state}`
								: running
									? 'Pause collection'
									: scene?.status === 'paused'
										? 'Resume collection'
										: scene?.status === 'complete'
											? 'Collection complete'
											: scene?.status === 'failed'
												? 'Collection stopped'
												: 'Start collection'}
						</Button>
						<div className="flex flex-wrap gap-2">
							<Button
								variant="secondary"
								disabled={disabled}
								onClick={() => connection.command('reset')}
							>
								Restart seed
							</Button>
							<Button
								variant="outline"
								disabled={disabled}
								onClick={() => connection.command('new_seed')}
							>
								New seed
							</Button>
						</div>
					</div>
					<div className="flex flex-col gap-2">
						<Button
							variant="secondary"
							disabled={
								disabled ||
								!!liveMission ||
								liveScene?.controller === 'learned_policy' ||
								(!connection.session?.recording && liveScene?.status !== 'ready')
							}
							onClick={() =>
								connection.command(connection.session?.recording ? 'stop_recording' : 'record')
							}
						>
							{connection.session?.recording ? 'Stop and save recording' : 'Record demonstration'}
						</Button>
						<p
							data-testid="recording-status"
							aria-live="polite"
							className="text-muted-foreground text-xs"
						>
							{connection.session?.recording
								? 'Recording every executed control step.'
								: connection.session?.last_episode_id
									? 'Demonstration saved in the library.'
									: 'Recording starts a fresh episode. Reset first if needed.'}
						</p>
						{connection.session?.recording_error && (
							<p className="text-destructive text-xs">{connection.session.recording_error}</p>
						)}
					</div>
					{liveScene?.controller === 'manual' && !playback && (
						<TeachingControls
							scene={liveScene}
							enabled={!disabled && liveScene.status === 'running'}
							send={connection.manual}
						/>
					)}
					<div className="flex flex-col gap-2">
						<h3 className="font-medium text-sm">View</h3>
						<ToggleGroup
							aria-label="Camera view"
							variant="outline"
							value={[cameraMode]}
							onValueChange={(value) => {
								if (value[0] === 'overview' || value[0] === 'follow' || value[0] === 'eye')
									setCameraMode(value[0])
							}}
						>
							<ToggleGroupItem value="overview">Overview</ToggleGroupItem>
							<ToggleGroupItem value="follow">Follow</ToggleGroupItem>
							<ToggleGroupItem value="eye">Robot eye</ToggleGroupItem>
						</ToggleGroup>
						{cameraMode === 'eye' && (
							<p className="text-muted-foreground text-xs">
								Inspection from Pip’s head. This is not a vision sensor used by the controller.
							</p>
						)}
						<Button
							variant="ghost"
							aria-pressed={sound.enabled}
							onClick={() => void sound.toggle()}
						>
							{sound.enabled ? 'Sound on' : 'Sound off'}
						</Button>
						{sound.error && <p className="text-muted-foreground text-xs">{sound.error}</p>}
					</div>
					{scene && (
						<>
							<div className="flex flex-col gap-1" aria-live="polite">
								<p data-testid="run-status" className="font-medium">
									{scene.status === 'ready'
										? 'Ready to collect'
										: scene.status === 'paused'
											? 'Paused'
											: scene.status === 'complete'
												? 'Delivery complete'
												: scene.status === 'failed'
													? 'Collection stopped'
													: 'Collecting'}
								</p>
								<p data-testid="task-stage" className="text-muted-foreground text-sm">
									{comparison.scene ? 'Recorded comparison' : stageLabels[scene.stage]}
								</p>
								<p data-testid="delivery-count" className="text-muted-foreground text-sm">
									{liveMission && !playback
										? `${liveMission.delivered}/${liveMission.total} capsules delivered`
										: `${scene.delivered ? 1 : 0} / 1 delivered`}
								</p>
								{scene.reason && <p className="text-destructive text-sm">{scene.reason}</p>}
							</div>
							<dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
								<dt className="text-muted-foreground">Seed</dt>
								<dd data-testid="session-seed">
									{library.selected?.entry.episode.seed ??
										(comparison.scene ? comparison.data?.seed : training.rollout?.seed) ??
										connection.session?.seed}
								</dd>
								<dt className="text-muted-foreground">
									{comparison.scene
										? 'Playback'
										: training.scene
											? 'Checkpoint round'
											: playback
												? 'Recording version'
												: 'Generation'}
								</dt>
								<dd data-testid="session-generation">
									{comparison.scene
										? 'Comparison'
										: training.scene
											? training.detail?.checkpoint.round
											: (library.selected?.entry.episode.schema_version ??
												connection.session?.generation)}
								</dd>
								<dt className="text-muted-foreground">Simulation tick</dt>
								<dd data-testid="simulation-tick">
									{library.selected
										? library.index
										: comparison.scene
											? comparison.index
											: training.scene
												? training.index
												: connection.session?.tick}
								</dd>
								<dt className="text-muted-foreground">Elapsed</dt>
								<dd>{scene.elapsed_seconds.toFixed(1)} s</dd>
								<dt className="text-muted-foreground">Collisions</dt>
								<dd data-testid="collisions">{scene.collisions}</dd>
								<dt className="text-muted-foreground">Invalid actions</dt>
								<dd data-testid="invalid-actions">{scene.invalid_actions}</dd>
							</dl>
							<ol
								aria-label="Task events"
								className="flex flex-col gap-2 text-muted-foreground text-xs leading-relaxed"
							>
								{scene.events.slice(-4).map((event) => (
									<li key={`${event.tick}-${event.kind}-${event.text}`}>{event.text}</li>
								))}
							</ol>
						</>
					)}
					<p className="mt-auto text-muted-foreground text-xs leading-relaxed">
						{liveMission && !playback
							? `Mission skill: ${liveMission.implementation ?? 'observing'}.`
							: playback
								? 'Stored-state playback.'
								: liveScene?.controller === 'manual'
									? 'Manual teaching controller.'
									: liveScene?.controller === 'learned_policy'
										? `Learned policy controller. Checkpoint ${connection.session?.checkpoint_id}.`
										: 'Scripted reference controller.'}{' '}
						Ideal target sensing and a simplified grasp. Head gestures and expressions are authored.
					</p>
					<Button
						variant="ghost"
						onClick={connection.reconnect}
						disabled={connection.status === 'connecting'}
					>
						{connected ? 'Reconnect' : 'Retry connection'}
					</Button>
				</aside>
			</div>
			<MissionPanel
				missions={missions}
				session={connection.session}
				connected={connected}
				checkpointId={training.selectedId}
				canStart={
					!disabled &&
					!liveMission &&
					!connection.session?.recording &&
					liveScene?.status === 'ready' &&
					connection.session?.tick === 0
				}
			/>
			<PracticePanel
				training={training}
				comparison={comparison}
				connected={connected}
				canReview={
					!liveMission &&
					liveScene?.status !== 'running' &&
					!connection.session?.recording &&
					!connection.pending &&
					!library.selected
				}
				onCompare={(seed, ids) => {
					library.close()
					training.closeReplay()
					void comparison.compare(seed, ids)
				}}
			/>
			<TrainingPanel
				training={training}
				connected={connected}
				eligible={library.data?.eligible_train ?? 0}
				canUse={
					!disabled &&
					!liveMission &&
					!connection.session?.recording &&
					(liveScene?.status === 'ready' || liveScene?.status === 'paused')
				}
				canReview={
					!liveMission && liveScene?.status !== 'running' && !connection.session?.recording
				}
				onUse={() => {
					connection.setController('learned_policy', training.selectedId)
					document.getElementById('greenhouse-view')?.scrollIntoView({ behavior: 'instant' })
				}}
				onReplay={(seed) => {
					if (library.selected) library.close()
					comparison.close()
					training.openReplay(seed)
					document.getElementById('greenhouse-view')?.scrollIntoView({ behavior: 'instant' })
				}}
			/>
			<DemonstrationLibrary
				onReview={() => {
					training.closeReplay()
					comparison.close()
				}}
				library={library}
				connected={connected}
				canReview={
					!liveMission && liveScene?.status !== 'running' && !connection.session?.recording
				}
			/>
			<footer className="border-border border-t px-6 py-4 text-muted-foreground text-sm">
				One caretaker, one greenhouse. Built to learn a useful task, one skill at a time.
			</footer>
		</main>
	)
}
