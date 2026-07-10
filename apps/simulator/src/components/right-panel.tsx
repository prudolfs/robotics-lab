// Right panel (docs/hud.md) — Phase 3.
//
// A single tabbed sidebar that hosts all the HUD widgets. Phase 1 landed the
// shell (show/hide toggle + 5-tab strip, four visible + one scrolled). Phase 2
// filled the panes. Phase 3 makes the per-card drag handle a real HTML5 drag
// source: dragging a handle closes the panel and drops that widget kind onto a
// viewport edge (see `DropZones` + `ViewportWidgetsLayer` in `App.tsx`). When
// a kind is already popped, its panel card hides the handle (the feed widgets
// compute this internally from `isPopped && !dockedOnViewport`) so the two
// copies don't both advertise dragging — and live-feed widgets (camera /
// minimap) show a placeholder in the panel while the live stream lives in the
// popped copy.
//
// The panel reads/writes only UI state from the Zustand store. It owns no
// simulation state, per the "React observes, the loop owns" contract. The
// `controls` from the simulation loop hook are threaded down so the Nav /
// Teleop / robot-debug widgets can drive reset / e-stop / coverage.

import type { LucideIcon } from 'lucide-react'
import {
	Compass,
	Gamepad2,
	Map as MapIcon,
	PanelRightClose,
	PanelRightOpen,
	Radar,
	Wrench,
} from 'lucide-react'
import { useRef } from 'react'
import { CameraControlsWidget } from '@/components/widgets/camera-controls-widget'
import { CameraFeedWidget } from '@/components/widgets/camera-feed-widget'
import { LidarWidget } from '@/components/widgets/lidar-widget'
import { LocalizationWidget } from '@/components/widgets/localization-widget'
import { LogsWidget } from '@/components/widgets/logs-widget'
import { MapControlsWidget } from '@/components/widgets/map-controls-widget'
import { MinimapWidget } from '@/components/widgets/minimap-widget'
import { NavigationWidget } from '@/components/widgets/navigation-widget'
import { RobotDebugWidget } from '@/components/widgets/robot-debug-widget'
import { TeleopWidget } from '@/components/widgets/teleop-widget'
import { cn } from '@/lib/utils'
import type { SimulationControls } from '@/sim/use-simulation-loop'
import { type PanelTab, useSimulatorStore } from '@/store'

type TabDef = { id: PanelTab; label: string; icon: LucideIcon }

const TABS: TabDef[] = [
	{ id: 'sensors', label: 'Sensors', icon: Radar },
	{ id: 'map', label: 'Map', icon: MapIcon },
	{ id: 'nav', label: 'Nav', icon: Compass },
	{ id: 'teleop', label: 'Teleop', icon: Gamepad2 },
	{ id: 'utils', label: 'Utils', icon: Wrench },
]

// The collapse toggle sits on the panel's leading edge. When collapsed we
// slide the panel by `calc(100% - <toggle> - gap)` so the toggle stays poking
// out and the panel remains reachable.
const TOGGLE_W = '2rem' // w-8

export interface RightPanelProps {
	/** Loop controls threaded down to the Nav / Teleop / robot-debug widgets. */
	controls: SimulationControls
	/** Imperative reset, passed to the robot-debug widget's Reset button. */
	onReset: () => void
}

export function RightPanel({ controls, onReset }: RightPanelProps) {
	const open = useSimulatorStore((s) => s.panelOpen)
	const activeTab = useSimulatorStore((s) => s.activeTab)
	const togglePanel = useSimulatorStore((s) => s.togglePanel)
	const setTab = useSimulatorStore((s) => s.setTab)

	const tabRefs = useRef<Record<PanelTab, HTMLButtonElement | null>>({
		sensors: null,
		map: null,
		nav: null,
		teleop: null,
		utils: null,
	})

	const selectTab = (tab: PanelTab) => {
		setTab(tab)
		requestAnimationFrame(() => {
			tabRefs.current[tab]?.scrollIntoView({
				behavior: 'smooth',
				block: 'nearest',
				inline: 'center',
			})
		})
	}

	return (
		<aside
			data-testid="right-panel"
			data-open={open}
			aria-label="Control panel"
			className={cn(
				// `top-12 bottom-8` clears the top app bar + footer status bar.
				'pointer-events-auto absolute top-12 right-4 bottom-8 z-10 flex w-80 max-w-[calc(100vw-2rem)] flex-col overflow-visible rounded-lg border border-border bg-card/80 shadow-2xl backdrop-blur-md transition-transform duration-300',
				open ? 'translate-x-0' : `translate-x-[calc(100%-1rem-${TOGGLE_W})]`,
			)}
		>
			<button
				type="button"
				data-testid="panel-toggle"
				aria-label={open ? 'Hide control panel' : 'Show control panel'}
				aria-expanded={open}
				aria-controls="right-panel-content"
				onClick={togglePanel}
				className="absolute top-1/2 -left-8 z-20 flex h-12 w-8 -translate-y-1/2 items-center justify-center rounded-l border border-border bg-card/80 shadow-lg backdrop-blur-sm transition-colors hover:bg-muted"
			>
				{open ? (
					<PanelRightClose className="size-4 text-primary" />
				) : (
					<PanelRightOpen className="size-4 text-primary" />
				)}
			</button>

			<div id="right-panel-content" className="flex h-full flex-col overflow-hidden">
				<div
					role="tablist"
					aria-label="Control panel tabs"
					className="no-scrollbar flex flex-none snap-x snap-mandatory overflow-x-auto border-border border-b"
				>
					{TABS.map(({ id, label, icon: Icon }) => {
						const active = id === activeTab
						return (
							<button
								key={id}
								ref={(el) => {
									tabRefs.current[id] = el
								}}
								type="button"
								role="tab"
								aria-selected={active}
								data-testid={`panel-tab-${id}`}
								onClick={() => selectTab(id)}
								className={cn(
									'flex w-1/4 flex-none snap-start flex-col items-center gap-1 py-2 transition-colors',
									active
										? 'border-primary border-b-2 text-primary'
										: 'border-transparent border-b-2 text-muted-foreground hover:text-foreground',
								)}
							>
								<Icon className="size-4" />
								<span className="font-semibold text-[9px] uppercase tracking-wider">{label}</span>
							</button>
						)
					})}
				</div>

				<div className="flex-1 overflow-y-auto p-4">
					<TabPane tab="sensors" active={activeTab}>
						<LidarWidget />
						<CameraControlsWidget />
						<CameraFeedWidget />
					</TabPane>
					<TabPane tab="map" active={activeTab}>
						<MapControlsWidget />
						<MinimapWidget />
					</TabPane>
					<TabPane tab="nav" active={activeTab}>
						<NavigationWidget controls={controls} />
						<LocalizationWidget />
					</TabPane>
					<TabPane tab="teleop" active={activeTab}>
						<TeleopWidget controls={controls} />
					</TabPane>
					<TabPane tab="utils" active={activeTab}>
						<RobotDebugWidget onReset={onReset} />
						<LogsWidget />
					</TabPane>
				</div>
			</div>
		</aside>
	)
}

/** A tab pane kept mounted but visually hidden when inactive. */
function TabPane({
	tab,
	active,
	children,
}: {
	tab: PanelTab
	active: PanelTab
	children: React.ReactNode
}) {
	return (
		<div
			role="tabpanel"
			data-testid={`panel-content-${tab}`}
			hidden={tab !== active}
			className="flex flex-col gap-3"
		>
			{children}
		</div>
	)
}
