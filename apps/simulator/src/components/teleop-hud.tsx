// Teleop HUD: the manual-driving overlay for milestone 4.
//
// It pulls observed robot/input state from the store and renders three things:
//   - Control hints: the keybindings legend.
//   - Robot status: run/paused flag, commanded wheel speeds, current speed.
//   - Speed adjustment: a throttle slider wired to the store's teleop config.
//
// The component only reads from the Zustand store and writes via `setBaseSpeed`
// / the loop controls passed in. It owns no simulation state itself, in keeping
// with the "React observes, the loop owns" contract.

import { Button } from '@/components/ui/button'
import type { SimulationControls } from '@/sim/use-simulation-loop'
import { useSimulatorStore } from '@/store'

const fmt = (n: number) => n.toFixed(2)

export function TeleopHud({ controls }: { controls: SimulationControls }) {
	const running = useSimulatorStore((s) => s.running)
	const speed = useSimulatorStore((s) => s.speed)
	const input = useSimulatorStore((s) => s.input)
	const teleop = useSimulatorStore((s) => s.teleop)
	const setBaseSpeed = useSimulatorStore((s) => s.setBaseSpeed)

	const stopped = input.leftWheel === 0 && input.rightWheel === 0
	const status = !running ? 'paused' : stopped ? 'idle' : 'driving'

	return (
		<div className="pointer-events-auto flex w-full flex-col gap-3 rounded-lg border border-border bg-card/80 p-3 backdrop-blur-sm">
			<div className="flex items-center justify-between">
				<span className="font-semibold text-foreground text-sm">Teleop</span>
				<StatusBadge status={status} />
			</div>

			<ControlHints baseSpeed={teleop.baseSpeed} />
			<div data-testid="teleop-status" className="sr-only" aria-hidden="true">
				{status}
			</div>

			<div className="flex flex-col gap-1">
				<span className="text-muted-foreground text-xs">Throttle (base speed)</span>
				<div className="flex items-center gap-2">
					<input
						type="range"
						min={0.1}
						max={1.5}
						step={0.05}
						value={teleop.baseSpeed}
						onChange={(e) => setBaseSpeed(Number(e.target.value))}
						aria-label="Base wheel speed"
						className="h-1 flex-1 cursor-pointer accent-primary"
					/>
					<span className="w-12 text-right font-mono text-foreground text-xs">
						{fmt(teleop.baseSpeed)} m/s
					</span>
				</div>
			</div>

			<div className="grid grid-cols-2 gap-x-3 gap-y-1">
				<span className="text-muted-foreground text-xs">Command L</span>
				<span className="text-right font-mono text-foreground text-xs">{fmt(input.leftWheel)}</span>
				<span className="text-muted-foreground text-xs">Command R</span>
				<span className="text-right font-mono text-foreground text-xs">
					{fmt(input.rightWheel)}
				</span>
				<span className="text-muted-foreground text-xs">Speed</span>
				<span className="text-right font-mono text-foreground text-xs">{fmt(speed)} m/s</span>
			</div>

			<Button
				data-testid="estop-button"
				variant="destructive"
				size="sm"
				onClick={controls.emergencyStop}
				className="w-full"
			>
				ESTOP
			</Button>
		</div>
	)
}

function StatusBadge({ status }: { status: 'paused' | 'idle' | 'driving' }) {
	const tone =
		status === 'driving'
			? 'text-emerald-500'
			: status === 'paused'
				? 'text-amber-500'
				: 'text-muted-foreground'
	return (
		<span className={`flex items-center gap-1 font-mono text-xs ${tone}`}>
			<span
				className={`inline-block size-1.5 rounded-full bg-current ${status === 'driving' ? 'animate-pulse' : ''}`}
			/>
			{status}
		</span>
	)
}

function ControlHints({ baseSpeed }: { baseSpeed: number }) {
	const Row = ({ keys, label }: { keys: string; label: string }) => (
		<div className="flex items-center justify-between">
			<kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
				{keys}
			</kbd>
			<span className="text-muted-foreground text-xs">{label}</span>
		</div>
	)
	return (
		<div
			data-testid="key-hints"
			className="flex flex-col gap-1 rounded border border-border bg-background/40 p-2"
		>
			<Row keys="W / ↑" label="forward" />
			<Row keys="S / ↓" label="reverse" />
			<Row keys="A / ←" label="turn left" />
			<Row keys="D / →" label="turn right" />
			<Row keys="Shift" label="boost ×2" />
			<Row keys="Space" label="emergency stop" />
			<span className="mt-1 text-[10px] text-muted-foreground">
				throttle {fmt(baseSpeed)} m/s · boost ×2
			</span>
		</div>
	)
}
