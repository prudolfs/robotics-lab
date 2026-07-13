// Top app bar (docs/hud.md Phase 3 + Phase 4).
//
// A fixed 48px (h-12) header folding in the formerly-scattered top-left HUD
// title + the top-centre map-name toggle group + the sim controls. All
// `data-testid`s are preserved so existing tests stay green:
//   - `simulator-hud` (container; smoke asserts it contains the title text)
//   - `robot-marker` (sr-only sentinel; launchSimulator waits for it to attach)
//   - `pause-resume-button`, `reset-button`, the per-map buttons
//   - `theme-toggle` (Phase 4d — the light/dark toggle; rendered **last** in
//     the header per the Phase 4 look-and-feel pass)
//   - ESTOP lives only in the Teleop tab (kept off the top bar to avoid a
//     duplicate global control / collision with the teleop `estop-button`).
//
// The play/pause + reset controls are **icon buttons** (lucide `Play`/`Pause`
// + `RotateCcw`) per the `.temp/right-panel/` mocks (which use Material
// `play_arrow` / `refresh`). Each carries an `sr-only` text label so the
// visible icon is the affordance while existing `toHaveText('Pause'/'Resume')`
// assertions keep matching. The theme toggle sits to the right of those, as
// the last header item.

import { Moon, Pause, Play, RotateCcw, Sun } from 'lucide-react'
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
			className="pointer-events-auto fixed inset-x-0 top-0 z-40 flex h-12 items-center justify-between gap-3 border-border border-b bg-card/80 px-3 backdrop-blur-md"
		>
			{/* Left: title + hidden robot sentinel. */}
			<div className="flex items-center gap-2">
				<h1 className="font-semibold text-foreground text-sm tracking-tight">
					Robotics Lab — Simulator
				</h1>
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

			{/* Right: sim controls (icon buttons) + theme toggle (last). */}
			<div className="flex items-center gap-1.5">
				<Button
					data-testid="pause-resume-button"
					variant={running ? 'outline' : 'default'}
					size="icon"
					className="size-8"
					onClick={controls.togglePause}
					aria-label={running ? 'Pause simulation' : 'Resume simulation'}
					aria-pressed={!running}
				>
					{running ? <Pause className="size-4" /> : <Play className="size-4" />}
					{/* sr-only text keeps existing `toHaveText('Pause'/'Resume')`
					    assertions matching without a visible label. */}
					<span className="sr-only">{running ? 'Pause' : 'Resume'}</span>
				</Button>
				<Button
					data-testid="reset-button"
					variant="outline"
					size="icon"
					className="size-8"
					onClick={controls.reset}
					aria-label="Reset simulation"
				>
					<RotateCcw className="size-4" />
					<span className="sr-only">Reset</span>
				</Button>
				<div className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
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
			</div>
		</header>
	)
}
