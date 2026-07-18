// Toggles widget (Inspect tab) — docs/simulator.md milestone 14.
//
// One consolidated home for every on/off overlay + scene-chrome switch so the
// user doesn't have to hunt across tabs. Two groupings mirror the milestone's
// two lists:
//
//   - Debug toggles: ground grid, coordinate axes — the scene's debug chrome.
//   - Visualization toggles: lidar rays, occupancy grid, planned path,
//     odometry trail, camera feed, minimap — every overlay drawn in the
//     viewport.
//
// Theme support is also surfaced here as a radio group (light / dark) so the
// Inspect tab is a complete picture, even though the toggle also lives in the
// top app bar. The widget owns nothing: it reads + flips the store flags.

import { Button } from '@/components/ui/button'
import { WidgetCard } from '@/components/widgets/widget-card'
import { cn } from '@/lib/utils'
import { type ThemeMode, useSimulatorStore, type WidgetId } from '@/store'

const WIDGET: WidgetId = 'inspect.toggles'

export function TogglesWidget() {
	// Debug toggles (scene chrome)
	const showSceneGrid = useSimulatorStore((s) => s.showSceneGrid)
	const toggleSceneGrid = useSimulatorStore((s) => s.toggleSceneGrid)
	const showSceneAxes = useSimulatorStore((s) => s.showSceneAxes)
	const toggleSceneAxes = useSimulatorStore((s) => s.toggleSceneAxes)

	// Visualization toggles (overlays)
	const showLidar = useSimulatorStore((s) => s.showLidar)
	const toggleLidar = useSimulatorStore((s) => s.toggleLidar)
	const showOccupancy = useSimulatorStore((s) => s.showOccupancy)
	const toggleOccupancy = useSimulatorStore((s) => s.toggleOccupancy)
	const showPath = useSimulatorStore((s) => s.showPath)
	const togglePath = useSimulatorStore((s) => s.togglePath)
	const showOdometry = useSimulatorStore((s) => s.showOdometry)
	const toggleOdometry = useSimulatorStore((s) => s.toggleOdometry)
	const showCamera = useSimulatorStore((s) => s.showCamera)
	const toggleCamera = useSimulatorStore((s) => s.toggleCamera)
	const showMinimap = useSimulatorStore((s) => s.showMinimap)
	const toggleMinimap = useSimulatorStore((s) => s.toggleMinimap)

	// Theme
	const theme = useSimulatorStore((s) => s.theme)
	const setTheme = useSimulatorStore((s) => s.setTheme)

	return (
		<WidgetCard title="Toggles" widget={WIDGET} data-testid="toggles" bodyClassName="gap-3">
			<SectionLabel>Debug</SectionLabel>
			<div className="flex flex-col gap-2">
				<ToggleRow
					label="Ground grid"
					active={showSceneGrid}
					onClick={toggleSceneGrid}
					testId="scene-grid-toggle"
				/>
				<ToggleRow
					label="Coordinate axes"
					active={showSceneAxes}
					onClick={toggleSceneAxes}
					testId="scene-axes-toggle"
				/>
			</div>

			<SectionLabel>Visualization</SectionLabel>
			<div className="flex flex-col gap-2">
				<ToggleRow
					label="Lidar rays"
					active={showLidar}
					onClick={toggleLidar}
					testId="viz-lidar-toggle"
				/>
				<ToggleRow
					label="Occupancy grid"
					active={showOccupancy}
					onClick={toggleOccupancy}
					testId="viz-occupancy-toggle"
				/>
				<ToggleRow
					label="Planned path"
					active={showPath}
					onClick={togglePath}
					testId="viz-path-toggle"
				/>
				<ToggleRow
					label="Odometry trail"
					active={showOdometry}
					onClick={toggleOdometry}
					testId="viz-odometry-toggle"
				/>
				<ToggleRow
					label="Camera feed"
					active={showCamera}
					onClick={toggleCamera}
					testId="viz-camera-toggle"
				/>
				<ToggleRow
					label="Minimap"
					active={showMinimap}
					onClick={toggleMinimap}
					testId="viz-minimap-toggle"
				/>
			</div>

			<SectionLabel>Theme</SectionLabel>
			<div className="flex items-center gap-2" role="radiogroup" aria-label="Color theme">
				{(['light', 'dark'] as ThemeMode[]).map((mode) => (
					<Button
						key={mode}
						variant={theme === mode ? 'default' : 'outline'}
						size="xs"
						onClick={() => setTheme(mode)}
						role="radio"
						aria-checked={theme === mode}
						data-testid={`theme-${mode}`}
						className={cn('flex-1 capitalize')}
					>
						{mode}
					</Button>
				))}
			</div>
		</WidgetCard>
	)
}

function SectionLabel({ children }: { children: React.ReactNode }) {
	return (
		<span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
			{children}
		</span>
	)
}

function ToggleRow({
	label,
	active,
	onClick,
	testId,
}: {
	label: string
	active: boolean
	onClick: () => void
	testId?: string
}) {
	return (
		<div className="flex items-center justify-between gap-2">
			<span className="text-muted-foreground text-xs">{label}</span>
			<button
				type="button"
				onClick={onClick}
				aria-checked={active}
				data-testid={testId}
				role="switch"
				aria-label={label}
				className={cn(
					'relative inline-flex h-5 w-9 flex-none items-center rounded-full border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
					active ? 'bg-primary' : 'bg-muted',
				)}
			>
				<span
					className={cn(
						'inline-block size-4 transform rounded-full bg-background shadow transition-transform',
						active ? 'translate-x-4' : 'translate-x-0.5',
					)}
				/>
			</button>
		</div>
	)
}
