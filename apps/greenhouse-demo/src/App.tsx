import { formatForDisplay } from '@tanstack/react-hotkeys'
import { Eye, Focus, Leaf, RotateCcw, Shuffle, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useComparison } from './api/use-comparison'
import { useDemonstrations } from './api/use-demonstrations'
import { useMissions } from './api/use-missions'
import { usePlayback } from './api/use-playback'
import { useSession } from './api/use-session'
import { useTraining } from './api/use-training'
import { DemonstrationLibrary, PlaybackControls } from './components/demonstration-library'
import { GreenhouseScene } from './components/greenhouse-scene'
import { MissionPanel } from './components/mission-panel'
import { ComparisonPlayback, PracticePanel } from './components/practice-panel'
import { TeachingControls } from './components/teaching-controls'
import { TrainingPanel, TrainingPlayback } from './components/training-panel'
import { Button } from './components/ui/button'
import { Kbd } from './components/ui/kbd'
import { ResizableHandle, ResizablePanelGroup } from './components/ui/resizable'
import { ScrollArea } from './components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from './components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './components/ui/tooltip'
import { useCaretakerSound } from './components/use-caretaker-sound'
import { type WorkspaceCommand, WorkspaceCommands } from './components/workspace-commands'
import { WorkspacePanel } from './components/workspace-panel'
import { type PanelId, panels, useWorkspace } from './state/workspace'

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
	const connected = connection.status === 'connected'
	const library = useDemonstrations(connected, connection.session?.last_episode_id)
	const training = useTraining(connected)
	const comparison = useComparison()
	const missions = useMissions(connected, connection.session)
	const preview = usePlayback()
	const playback = preview.replay.kind !== 'live'
	const liveScene = connection.session?.scene
	const liveMission = connection.session?.mission
	const scene = preview.scene ?? liveScene
	const panel = useWorkspace((state) => state.panel)
	const cameraMode = useWorkspace((state) => state.camera)
	const paletteOpen = useWorkspace((state) => state.paletteOpen)
	const setCameraMode = useWorkspace.getState().setCamera
	const [vertical, setVertical] = useState(() => matchMedia('(max-width: 899px)').matches)
	useEffect(() => {
		const query = matchMedia('(max-width: 899px)')
		const changed = () => setVertical(query.matches)
		query.addEventListener('change', changed)
		return () => query.removeEventListener('change', changed)
	}, [])
	useEffect(() => {
		if (connection.session)
			useWorkspace
				.getState()
				.bindSession(connection.session.session_id, connection.session.generation)
	}, [connection.session?.session_id, connection.session?.generation, connection.session])
	const sound = useCaretakerSound(
		playback ? undefined : liveScene,
		playback ? -1 : (connection.session?.generation ?? 0),
	)
	const running = scene?.status === 'running'
	const terminal = scene?.status === 'complete' || scene?.status === 'failed'
	const disabled = !connected || connection.pending || playback
	const canReview =
		connected &&
		!liveMission &&
		liveScene?.status !== 'running' &&
		!connection.session?.recording &&
		!connection.pending
	const canUse =
		!disabled &&
		!liveMission &&
		!connection.session?.recording &&
		(liveScene?.status === 'ready' || liveScene?.status === 'paused') &&
		!!training.detail?.checkpoint.compatible &&
		training.detail.checkpoint.checkpoint_id === training.selectedId
	const canRecord =
		!disabled &&
		!liveMission &&
		liveScene?.controller !== 'learned_policy' &&
		(!!connection.session?.recording || liveScene?.status === 'ready')
	const canStartMission =
		!disabled &&
		!liveMission &&
		!connection.session?.recording &&
		liveScene?.status === 'ready' &&
		connection.session?.tick === 0
	const run = () =>
		liveMission
			? void missions.control(
					liveMission.state === 'paused' ? 'resume' : 'pause',
					liveMission.mission_id,
				)
			: connection.command(running ? 'pause' : 'start')
	const runLabel = liveMission
		? `Mission ${liveMission.state}`
		: running
			? 'Pause collection'
			: scene?.status === 'paused'
				? 'Resume collection'
				: scene?.status === 'complete'
					? 'Collection complete'
					: scene?.status === 'failed'
						? 'Collection stopped'
						: 'Start collection'
	const openPanel = useWorkspace.getState().openPanel
	const labels: Record<PanelId, string> = {
		watch: 'Watch',
		teach: 'Teach',
		train: 'Train',
		compare: 'Compare',
		missions: 'Missions',
	}
	const commands: WorkspaceCommand[] = [
		...panels.map((id, index) => ({
			id: `panel-${id}`,
			title: `Open ${labels[id]} panel`,
			group: 'Panels',
			shortcut: (['Mod+1', 'Mod+2', 'Mod+3', 'Mod+4', 'Mod+5'] as const)[index],
			run: () => openPanel(id),
		})),
		{
			id: 'run',
			title: running ? 'Pause simulation' : 'Start or resume simulation',
			group: 'Simulation',
			shortcut: 'Mod+Enter',
			enabled: !disabled && !terminal && !!scene,
			reason: 'Connect and return to a live, ready or paused world.',
			run,
		},
		{
			id: 'reset',
			title: 'Restart current seed',
			group: 'Simulation',
			shortcut: 'Mod+Shift+R',
			enabled: !disabled,
			reason: 'Connect and return to live control.',
			run: () => connection.command('reset'),
		},
		{
			id: 'seed',
			title: 'Start a new seed',
			group: 'Simulation',
			shortcut: 'Mod+Shift+N',
			enabled: !disabled,
			run: () => connection.command('new_seed'),
		},
		{
			id: 'reconnect',
			title: 'Reconnect to Python server',
			group: 'Simulation',
			run: connection.reconnect,
		},
		{
			id: 'live',
			title: 'Return to live simulation',
			group: 'Playback',
			enabled: playback,
			run: useWorkspace.getState().returnLive,
		},
		{
			id: 'playback',
			title: preview.playing ? 'Pause recorded playback' : 'Play recorded playback',
			group: 'Playback',
			enabled: playback,
			run: useWorkspace.getState().togglePlayback,
		},
		{
			id: 'overview',
			title: 'Camera: Overview',
			group: 'View',
			run: () => setCameraMode('overview'),
		},
		{
			id: 'follow',
			title: 'Camera: Follow Pip',
			group: 'View',
			run: () => setCameraMode('follow'),
		},
		{ id: 'eye', title: 'Camera: Robot eye', group: 'View', run: () => setCameraMode('eye') },
		{
			id: 'sound',
			title: sound.enabled ? 'Turn sound off' : 'Turn sound on',
			group: 'View',
			run: () => void sound.toggle(),
		},
		{
			id: 'manual',
			title: 'Teach with manual controls',
			group: 'Teaching',
			enabled: !disabled && !liveMission && !running && !terminal && !connection.session?.recording,
			reason: 'Pause or reset the live world first.',
			run: () => {
				connection.setController('manual')
				openPanel('teach')
			},
		},
		{
			id: 'reference',
			title: 'Select scripted reference controller',
			group: 'Simulation',
			enabled: !disabled && !liveMission && !running && !terminal,
			run: () => connection.setController('scripted_reference'),
		},
		{
			id: 'use-checkpoint',
			title: 'Use selected learned checkpoint',
			group: 'Training',
			enabled: canUse,
			reason: 'Choose a compatible checkpoint and pause/reset the live world.',
			run: () => connection.setController('learned_policy', training.selectedId),
		},
		{
			id: 'collect',
			title: 'Collect 20 expert demonstrations',
			group: 'Teaching',
			enabled: connected && !library.busy,
			run: () => {
				openPanel('teach')
				void library.collect()
			},
		},
		{
			id: 'validate',
			title: 'Validate demonstration dataset',
			group: 'Teaching',
			enabled: connected && !library.busy,
			run: () => {
				openPanel('teach')
				void library.validate()
			},
		},
		{
			id: 'export',
			title: 'Export demonstration dataset',
			group: 'Teaching',
			enabled: connected && !library.busy,
			run: () => void library.download(),
		},
		{
			id: 'train',
			title: 'Configure imitation training',
			group: 'Training',
			enabled: connected && !training.busy && !training.active && !!library.data?.eligible_train,
			reason: 'Review and include training demonstrations first.',
			run: () => {
				openPanel('train')
			},
		},
		{
			id: 'record',
			title: connection.session?.recording ? 'Stop and save demonstration' : 'Record demonstration',
			group: 'Teaching',
			enabled: canRecord,
			reason: 'Reset a manual or reference world before recording.',
			run: () => {
				openPanel('teach')
				connection.command(connection.session?.recording ? 'stop_recording' : 'record')
			},
		},
		{
			id: 'import',
			title: 'Import demonstrations from JSON',
			group: 'Teaching',
			run: () => {
				openPanel('teach')
				requestAnimationFrame(() => document.getElementById('dataset-import')?.click())
			},
		},
		{
			id: 'practice',
			title: 'Configure PPO practice from a saved checkpoint',
			group: 'Training',
			run: () => openPanel('compare'),
		},
		{
			id: 'checkpoints',
			title: 'Select a saved checkpoint',
			group: 'Training',
			run: () => openPanel('train'),
		},
		{
			id: 'compare-policies',
			title: 'Configure comparison on a held-out seed',
			group: 'Playback',
			run: () => openPanel('compare'),
		},
		{
			id: 'mission-start',
			title: 'Configure and start a structured mission',
			group: 'Missions',
			run: () => openPanel('missions'),
		},
		{
			id: 'mission-plan',
			title: 'Draft a mission from an instruction',
			group: 'Missions',
			run: () => openPanel('missions'),
		},
		{
			id: 'mission-inspect',
			title: 'Inspect persistent mission graph checkpoint',
			group: 'Missions',
			enabled: !!missions.selected && !missions.busy && connected,
			run: () => {
				openPanel('missions')
				void missions.inspect()
			},
		},
		{
			id: 'cancel-training',
			title: 'Cancel active training job',
			group: 'Training',
			enabled: !!training.active,
			run: () => void training.cancel(),
		},
		{
			id: 'mission-pause',
			title: liveMission?.state === 'paused' ? 'Resume current mission' : 'Pause current mission',
			group: 'Missions',
			enabled: !disabled && (liveMission?.state === 'running' || liveMission?.state === 'paused'),
			run: () =>
				void missions.control(
					liveMission?.state === 'paused' ? 'resume' : 'pause',
					liveMission?.mission_id,
				),
		},
		{
			id: 'mission-cancel',
			title: 'Cancel current mission',
			group: 'Missions',
			enabled: !disabled && (liveMission?.state === 'running' || liveMission?.state === 'paused'),
			run: () => void missions.control('cancel', liveMission?.mission_id),
		},
	]
	return (
		<TooltipProvider>
			<main className="workspace-shell flex h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground">
				<header className="flex h-12 shrink-0 items-center justify-between gap-3 border-border border-b px-4">
					<div className="flex min-w-0 items-center gap-2">
						<Leaf className="size-5 text-primary" />
						<h1 className="truncate font-medium text-sm">Greenhouse Caretaker</h1>
						<span className="hidden text-muted-foreground text-xs sm:inline">Robotics Lab</span>
					</div>
					<WorkspaceCommands commands={commands} />
				</header>
				<ResizablePanelGroup
					key={vertical ? 'vertical' : 'horizontal'}
					orientation={vertical ? 'vertical' : 'horizontal'}
					className="min-h-0 flex-1"
				>
					<WorkspacePanel vertical={vertical}>
						<div id="greenhouse-view" className="flex h-full min-h-0 flex-col overflow-hidden">
							<div
								role="toolbar"
								aria-label="Simulation controls"
								className="flex shrink-0 flex-wrap items-center gap-1 border-border border-b px-2 py-2"
							>
								<Button
									size="sm"
									disabled={disabled || missions.busy || !scene || terminal}
									onClick={run}
								>
									{runLabel}
								</Button>
								<Tooltip>
									<TooltipTrigger
										render={
											<Button
												size="icon-sm"
												variant="ghost"
												disabled={disabled}
												onClick={() => connection.command('reset')}
												aria-label="Restart seed"
											/>
										}
									>
										<RotateCcw />
									</TooltipTrigger>
									<TooltipContent>
										Restart seed <Kbd>{formatForDisplay('Mod+Shift+R')}</Kbd>
									</TooltipContent>
								</Tooltip>
								<Tooltip>
									<TooltipTrigger
										render={
											<Button
												size="icon-sm"
												variant="ghost"
												disabled={disabled}
												onClick={() => connection.command('new_seed')}
												aria-label="New seed"
											/>
										}
									>
										<Shuffle />
									</TooltipTrigger>
									<TooltipContent>New seed</TooltipContent>
								</Tooltip>
								<div className="ml-auto flex items-center gap-1">
									<ToggleGroup
										aria-label="Camera view"
										variant="outline"
										size="sm"
										value={[cameraMode]}
										onValueChange={(value) => {
											if (value[0] === 'overview' || value[0] === 'follow' || value[0] === 'eye')
												setCameraMode(value[0])
										}}
									>
										<ToggleGroupItem value="overview" aria-label="Overview">
											<Focus />
										</ToggleGroupItem>
										<ToggleGroupItem value="follow" aria-label="Follow">
											<Leaf />
										</ToggleGroupItem>
										<ToggleGroupItem value="eye" aria-label="Robot eye">
											<Eye />
										</ToggleGroupItem>
									</ToggleGroup>
									<Button
										size="icon-sm"
										variant="ghost"
										aria-label={sound.enabled ? 'Sound on' : 'Sound off'}
										aria-pressed={sound.enabled}
										onClick={() => void sound.toggle()}
									>
										{sound.enabled ? <Volume2 /> : <VolumeX />}
									</Button>
								</div>
							</div>
							{cameraMode === 'eye' && (
								<p className="shrink-0 border-border border-b px-3 py-1 text-muted-foreground text-xs">
									Head-mounted inspection. This is not a vision sensor; the controller uses
									structured observations.
								</p>
							)}
							{playback && (
								<div className="max-h-36 shrink-0 overflow-y-auto">
									<PlaybackControls library={library} />
									<TrainingPlayback training={training} />
									<ComparisonPlayback comparison={comparison} />
								</div>
							)}
							<GreenhouseScene
								scene={scene ?? null}
								generation={playback ? preview.generation : (connection.session?.generation ?? 0)}
								cameraMode={cameraMode}
							/>
						</div>
					</WorkspacePanel>
					<ResizableHandle withHandle aria-label="Resize greenhouse and inspector" />
					<WorkspacePanel vertical={vertical} inspector>
						<Tabs
							value={panel}
							onValueChange={(value) => {
								if (panels.includes(value as PanelId)) openPanel(value as PanelId)
							}}
							className="h-full min-h-0 gap-0"
						>
							<TabsList
								aria-label="Workspace panels"
								variant="line"
								className="h-11 w-full shrink-0 justify-start border-border border-b px-2"
							>
								{panels.map((id, index) => (
									<TabsTrigger key={id} value={id} title={`${labels[id]} · ${index + 1}`}>
										{labels[id]}
									</TabsTrigger>
								))}
							</TabsList>
							<TabsContent value="watch" keepMounted className="min-h-0 overflow-hidden">
								<ScrollArea className="h-full">
									{' '}
									<aside
										aria-label="Caretaker session"
										className="flex w-full flex-col gap-5 p-4 lg:shrink-0 lg:overflow-y-auto"
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
												disabled={
													disabled || !!liveMission || liveScene?.status === 'running' || terminal
												}
												onValueChange={(value) => {
													if (value[0] === 'learned_policy' && training.selectedId)
														connection.setController('learned_policy', training.selectedId)
													else if (value[0] === 'manual' || value[0] === 'scripted_reference')
														connection.setController(value[0])
												}}
											>
												<ToggleGroupItem value="scripted_reference">Reference</ToggleGroupItem>
												<ToggleGroupItem value="manual">Teach manually</ToggleGroupItem>
												<ToggleGroupItem value="learned_policy" disabled={!canUse}>
													Learned
												</ToggleGroupItem>
											</ToggleGroup>
											<p className="text-muted-foreground text-xs">
												Pause before changing controller. New seeds stay in the training range 0–99.
											</p>
										</div>
										{connection.session?.controller_error && (
											<p className="text-destructive text-xs">
												{connection.session.controller_error}
											</p>
										)}
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
													{scene.reason && (
														<p className="text-destructive text-sm">{scene.reason}</p>
													)}
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
											Ideal target sensing and a simplified grasp. Head gestures and expressions are
											authored.
										</p>
										<Button
											variant="ghost"
											onClick={connection.reconnect}
											disabled={connection.status === 'connecting'}
										>
											{connected ? 'Reconnect' : 'Retry connection'}
										</Button>
									</aside>
								</ScrollArea>
							</TabsContent>
							<TabsContent value="teach" keepMounted className="min-h-0 overflow-hidden">
								<ScrollArea className="h-full">
									<section aria-label="Teach Pip" className="flex flex-col gap-3 p-4">
										<h2 className="font-medium text-lg">Teach Pip</h2>
										<p className="text-muted-foreground text-sm">
											Choose manual control in Watch, or use the command menu. Record attempts and
											review what the robot should learn.
										</p>{' '}
										<div className="flex flex-col gap-2">
											<Button
												variant="secondary"
												disabled={!canRecord}
												onClick={() =>
													connection.command(
														connection.session?.recording ? 'stop_recording' : 'record',
													)
												}
											>
												{connection.session?.recording
													? 'Stop and save recording'
													: 'Record demonstration'}
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
												<p className="text-destructive text-xs">
													{connection.session.recording_error}
												</p>
											)}
										</div>
										{liveScene?.controller === 'manual' && !playback && (
											<TeachingControls
												scene={liveScene}
												enabled={
													!disabled &&
													panel === 'teach' &&
													!paletteOpen &&
													liveScene.status === 'running'
												}
												send={connection.manual}
											/>
										)}
									</section>
									<DemonstrationLibrary
										library={library}
										connected={connected}
										canReview={canReview}
									/>
								</ScrollArea>
							</TabsContent>
							<TabsContent value="train" keepMounted className="min-h-0 overflow-hidden">
								<ScrollArea className="h-full">
									<TrainingPanel
										training={training}
										connected={connected}
										eligible={library.data?.eligible_train ?? 0}
										canUse={canUse}
										canReview={canReview}
										onUse={() => connection.setController('learned_policy', training.selectedId)}
										onReplay={training.openReplay}
									/>
								</ScrollArea>
							</TabsContent>
							<TabsContent value="compare" keepMounted className="min-h-0 overflow-hidden">
								<ScrollArea className="h-full">
									<PracticePanel
										training={training}
										comparison={comparison}
										connected={connected}
										canReview={canReview}
										onCompare={(seed, ids) => void comparison.compare(seed, ids)}
									/>
								</ScrollArea>
							</TabsContent>
							<TabsContent value="missions" keepMounted className="min-h-0 overflow-hidden">
								<ScrollArea className="h-full">
									<MissionPanel
										missions={missions}
										session={connection.session}
										connected={connected}
										checkpointId={training.selectedId}
										canStart={canStartMission}
									/>
								</ScrollArea>
							</TabsContent>
						</Tabs>
					</WorkspacePanel>
				</ResizablePanelGroup>
				<footer className="flex h-7 shrink-0 items-center justify-between gap-3 border-border border-t px-3 text-muted-foreground text-xs">
					<span>
						{connected ? 'Python connected' : connection.status} ·{' '}
						{playback ? 'Recorded playback' : 'Live simulation'}
					</span>
					<span className="truncate">
						{liveMission
							? `${liveMission.delivered}/${liveMission.total} delivered`
							: scene
								? `Seed ${connection.session?.seed} · ${scene.elapsed_seconds.toFixed(1)} s`
								: 'Connecting to greenhouse'}
					</span>
				</footer>
			</main>
		</TooltipProvider>
	)
}
