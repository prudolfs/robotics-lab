// Right panel shell (Phase 1 of docs/hud.md).
//
// A single tabbed sidebar that will host all the HUD widgets in later phases.
// For now it owns only its own show/hide toggle and a 5-tab strip where four
// tabs are visible and the fifth is reachable by horizontal scroll (each tab
// is flex-none w-1/4 of the strip, with snap-x + a hidden scrollbar).
//
// The panel reads/writes only the `panel` slice of the Zustand store
// (`panelOpen` / `activeTab` + `togglePanel` / `setTab`). It owns no
// simulation state, per the "React observes, the loop owns" contract.

import {
	Compass,
	Gamepad2,
	Map as MapIcon,
	PanelRightClose,
	PanelRightOpen,
	Radar,
	Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useRef } from 'react'
import { cn } from '@/lib/utils'
import { type PanelTab, useSimulatorStore } from '@/store'

type TabDef = { id: PanelTab; label: string; icon: LucideIcon }

const TABS: TabDef[] = [
	{ id: 'sensors', label: 'Sensors', icon: Radar },
	{ id: 'map', label: 'Map', icon: MapIcon },
	{ id: 'nav', label: 'Nav', icon: Compass },
	{ id: 'teleop', label: 'Teleop', icon: Gamepad2 },
	{ id: 'utils', label: 'Utils', icon: Wrench },
]

const TAB_CONTENT: Record<PanelTab, string> = {
	sensors: 'Sensors widget area',
	map: 'Map widget area',
	nav: 'Nav widget area',
	teleop: 'Teleop widget area',
	utils: 'Utils widget area',
}

// The collapse toggle sits on the panel's leading edge. When collapsed we
// slide the panel by `calc(100% - <toggle> - gap)` so the toggle stays poking
// out and the panel remains reachable — matching the reference
// `#collapse-toggle { left: -32px }` behaviour.
const TOGGLE_W = '2rem' // w-8

export function RightPanel() {
	const open = useSimulatorStore((s) => s.panelOpen)
	const activeTab = useSimulatorStore((s) => s.activeTab)
	const togglePanel = useSimulatorStore((s) => s.togglePanel)
	const setTab = useSimulatorStore((s) => s.setTab)

	// Keep refs to each tab button so selecting a tab can scroll it into view
	// inside the horizontally-scrollable strip (the 5th tab is off-strip until
	// scrolled). The reference `switchTab()` does `scrollIntoView({inline:'center'})`.
	const tabRefs = useRef<Record<PanelTab, HTMLButtonElement | null>>({
		sensors: null,
		map: null,
		nav: null,
		teleop: null,
		utils: null,
	})

	const selectTab = (tab: PanelTab) => {
		setTab(tab)
		// Defer so the button exists in the DOM after the state swap.
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
				'pointer-events-auto absolute top-4 right-4 bottom-4 z-10 flex w-80 max-w-[calc(100vw-2rem)] flex-col overflow-visible rounded-lg border border-border bg-card/80 shadow-2xl backdrop-blur-md transition-transform duration-300',
				// Slide almost fully off-screen when collapsed, leaving the toggle
				// (which lives at the panel's leading edge) visible.
				open ? 'translate-x-0' : `translate-x-[calc(100%-1rem-${TOGGLE_W})]`,
			)}
		>
			{/* Collapse toggle — on the panel's leading (left) edge. Because it is
			    a child of the translated panel, when the panel is "collapsed" the
			    toggle stays poking out and remains clickable to re-open it. */}
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
				{/* Tab strip: horizontally scrollable, 4 tabs visible, 5th scrolled in.
				    `no-scrollbar` hides the scrollbar while preserving scrolling. */}
				<div
					role="tablist"
					aria-label="Control panel tabs"
					className="no-scrollbar flex flex-none snap-x snap-mandatory overflow-x-auto border-b border-border"
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
										? 'border-b-2 border-primary text-primary'
										: 'border-b-2 border-transparent text-muted-foreground hover:text-foreground',
								)}
							>
								<Icon className="size-4" />
								<span className="text-[9px] font-semibold uppercase tracking-wider">
									{label}
								</span>
							</button>
						)
					})}
				</div>

				{/* Tab content panes — empty in Phase 1, filled in Phase 2. */}
				<div className="flex-1 overflow-y-auto p-4">
					{TABS.map(({ id }) => (
						<div
							key={id}
							role="tabpanel"
							data-testid={`panel-content-${id}`}
							hidden={id !== activeTab}
							className="flex flex-col gap-3"
						>
							<span className="font-mono text-muted-foreground text-xs">
								{TAB_CONTENT[id]}
							</span>
						</div>
					))}
				</div>
			</div>
		</aside>
	)
}
