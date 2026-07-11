// Top app bar (docs/hud.md Phase 3).
//
// A fixed 48px (h-12) header folding in the formerly-scattered top-left HUD
// title + the top-centre map-name toggle group + the Pause / Reset / ESTOP
// controls. All `data-testid`s are preserved so existing tests stay green:
//   - `simulator-hud` (container; smoke asserts it contains the title text)
//   - `robot-marker` (sr-only sentinel; launchSimulator waits for it to attach)
//   - `pause-resume-button`, `reset-button`, the per-map buttons
//   - ESTOP lives only in the Teleop tab (kept off the top bar to avoid a
//     duplicate global control / collision with the teleop `estop-button`).

import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SimulationControls } from '@/sim/use-simulation-loop'
import { useSimulatorStore } from '@/store'

export interface TopAppBarProps {
	controls: SimulationControls
}

export function TopAppBar({ controls }: TopAppBarProps) {
	const mapNames = useSimulatorStore((s) => s.mapNames)
	const selectedMap = useSimulatorStore((s) => s.selectedMap)
	const running = useSimulatorStore((s) => s.running)
	const robot = useSimulatorStore((s) => s.robot)
	const selectMap = useSimulatorStore((s) => s.selectMap)
	const theme = useSimulatorStore((s) => s.theme)
	const toggleTheme = useSimulatorStore((s) => s.toggleTheme)

	return (
		<header
			data-testid="simulator-hud"
			className="pointer-events-auto fixed inset-x-0 top-0 z-40 flex h-12 items-center justify-between gap-3 border-border border-b bg-card/70 px-3 backdrop-blur-md"
		>
			{/* Left: title + hidden robot sentinel. */}
			<div className="flex items-center gap-2">
				<h1 className="font-semibold text-foreground text-sm">Robotics Lab — Simulator</h1>
				{robot && (
					<span data-testid="robot-marker" className="sr-only" aria-hidden="true">
						robot present
					</span>
				)}
			</div>

			{/* Centre: map-name toggle group. */}
			<div className="flex flex-none items-center gap-1 rounded-md border border-border bg-background/40 p-0.5">
				{mapNames.map((name) => {
					const active = name === selectedMap
					return (
						<Button
							key={name}
							variant={active ? 'default' : 'ghost'}
							size="xs"
							onClick={() => selectMap(name)}
							className={cn('flex-none', active && 'shadow-sm')}
						>
							{name}
						</Button>
					)
				})}
			</div>

			{/* Right: sim controls + theme toggle. */}
			<div className="flex items-center gap-2">
				<Button
					data-testid="theme-toggle"
					variant="ghost"
					size="icon"
					className="size-8"
					onClick={toggleTheme}
					aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
					aria-pressed={theme === 'dark'}
				>
					{theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
				</Button>
				<Button
					data-testid="pause-resume-button"
					variant={running ? 'outline' : 'default'}
					size="sm"
					onClick={controls.togglePause}
					className="h-8"
				>
					{running ? 'Pause' : 'Resume'}
				</Button>
				<Button
					data-testid="reset-button"
					variant="outline"
					size="sm"
					onClick={controls.reset}
					className="h-8"
				>
					Reset
				</Button>
			</div>
		</header>
	)
}
