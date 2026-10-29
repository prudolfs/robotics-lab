import { useState } from 'react'
import { useSession } from './api/use-session'
import { type CameraMode, GreenhouseScene } from './components/greenhouse-scene'
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
}

export function App() {
	const connection = useSession()
	const [cameraMode, setCameraMode] = useState<CameraMode>('overview')
	const connected = connection.status === 'connected'
	const scene = connection.session?.scene
	const sound = useCaretakerSound(scene, connection.session?.generation ?? 0)
	const running = scene?.status === 'running'
	const terminal = scene?.status === 'complete' || scene?.status === 'failed'
	const disabled = !connected || connection.pending
	return (
		<main className="flex min-h-screen flex-col bg-background text-foreground">
			<header className="flex flex-wrap items-center justify-between gap-4 border-border border-b px-6 py-5">
				<div>
					<h1 className="font-medium text-xl">Greenhouse Caretaker</h1>
					<p className="mt-1 text-muted-foreground text-sm">
						A small robot learning to lend a hand.
					</p>
				</div>
				<p className="text-muted-foreground text-sm">Robotics Lab · Phase 3</p>
			</header>
			<div
				className="flex min-h-[580px] flex-1 flex-col lg:flex-row"
				style={{ minHeight: 'calc(100vh - 200px)' }}
			>
				<GreenhouseScene
					scene={scene ?? null}
					generation={connection.session?.generation ?? 0}
					cameraMode={cameraMode}
				/>
				<aside
					aria-label="Caretaker session"
					className="flex w-full flex-col gap-5 border-border border-t p-6 lg:w-80 lg:shrink-0 lg:border-t-0 lg:border-l"
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
					<div className="flex flex-col gap-3">
						<Button
							disabled={disabled || !scene || terminal}
							onClick={() => connection.command(running ? 'pause' : 'start')}
						>
							{running
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
									{stageLabels[scene.stage]}
								</p>
								<p data-testid="delivery-count" className="text-muted-foreground text-sm">
									{scene.delivered ? 1 : 0} / 1 delivered
								</p>
								{scene.reason && <p className="text-destructive text-sm">{scene.reason}</p>}
							</div>
							<dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
								<dt className="text-muted-foreground">Seed</dt>
								<dd data-testid="session-seed">{connection.session?.seed}</dd>
								<dt className="text-muted-foreground">Generation</dt>
								<dd data-testid="session-generation">{connection.session?.generation}</dd>
								<dt className="text-muted-foreground">Simulation tick</dt>
								<dd data-testid="simulation-tick">{connection.session?.tick}</dd>
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
						Scripted reference controller. Ideal target sensing and a simplified grasp; learning
						arrives in later phases. Head gestures and expressions are authored.
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
			<footer className="border-border border-t px-6 py-4 text-muted-foreground text-sm">
				One caretaker, one greenhouse. Built to learn a useful task, one skill at a time.
			</footer>
		</main>
	)
}
