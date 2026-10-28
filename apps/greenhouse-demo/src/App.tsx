import { useSession } from './api/use-session'
import { GreenhouseScene } from './components/greenhouse-scene'
import { Button } from './components/ui/button'

export function App() {
	const connection = useSession()
	const connected = connection.status === 'connected'
	return (
		<main className="flex min-h-screen flex-col bg-background text-foreground">
			<header className="flex flex-wrap items-center justify-between gap-4 border-border border-b px-6 py-5">
				<div>
					<h1 className="font-medium text-xl">Greenhouse Caretaker</h1>
					<p className="mt-1 text-muted-foreground text-sm">
						A small robot learning to lend a hand.
					</p>
				</div>
				<p className="text-muted-foreground text-sm">Robotics Lab · Phase 1</p>
			</header>
			<div
				className="flex min-h-[580px] flex-1 flex-col lg:flex-row"
				style={{ minHeight: 'calc(100vh - 200px)' }}
			>
				<GreenhouseScene scene={connection.session?.scene ?? null} />
				<aside
					aria-label="Caretaker session"
					className="flex w-full flex-col gap-6 border-border border-t p-6 lg:w-80 lg:shrink-0 lg:border-t-0 lg:border-l"
				>
					<div>
						<h2 className="font-medium text-lg">Welcome to the greenhouse</h2>
						<p className="mt-3 text-muted-foreground text-sm leading-relaxed">
							Your caretaker’s home is taking shape. This preview connects to your own Python
							server.
						</p>
					</div>
					<div className="flex flex-col gap-2">
						<h3 className="font-medium text-sm">Connection</h3>
						<p data-testid="connection-status" aria-live="polite">
							{connected
								? 'Connected'
								: connection.status === 'connecting'
									? 'Connecting…'
									: connection.status === 'error'
										? 'Connection error'
										: 'Server unavailable'}
						</p>
						<p role="status" className="text-muted-foreground text-sm leading-relaxed">
							{connection.message}
						</p>
						{!connected && connection.status !== 'connecting' && (
							<p className="text-muted-foreground text-sm">
								Run <code>pnpm dev:greenhouse</code> from the repository, then retry.
							</p>
						)}
					</div>
					<div className="flex flex-wrap gap-2">
						<Button onClick={connection.resetPreview} disabled={!connected || connection.pending}>
							{connection.pending ? 'Resetting…' : 'Reset preview'}
						</Button>
						<Button
							variant="outline"
							onClick={connection.reconnect}
							disabled={connection.status === 'connecting'}
						>
							{connected ? 'Reconnect' : 'Retry connection'}
						</Button>
					</div>
					{connection.session && (
						<dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
							<dt className="text-muted-foreground">Seed</dt>
							<dd data-testid="session-seed">{connection.session.seed}</dd>
							<dt className="text-muted-foreground">Generation</dt>
							<dd data-testid="session-generation">{connection.session.generation}</dd>
							<dt className="text-muted-foreground">Simulation tick</dt>
							<dd>{connection.session.tick}</dd>
						</dl>
					)}
					<p className="mt-auto text-muted-foreground text-sm leading-relaxed">
						Static session preview. Movement and collection arrive in Phase 2; teaching and training
						follow later.
					</p>
				</aside>
			</div>
			<footer className="border-border border-t px-6 py-4 text-muted-foreground text-sm">
				One caretaker, one greenhouse. Built to learn a useful task, one skill at a time.
			</footer>
		</main>
	)
}
