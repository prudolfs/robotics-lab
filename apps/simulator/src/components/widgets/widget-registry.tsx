// Widget registry (docs/hud.md Phase 3).
//
// Maps a `WidgetId` to its rendered component, so the same widget body renders
// in the right panel (when docked-in-panel) and in the popped copy docked on
// the viewport. With the new "move, not duplicate" model a widget kind is in
// exactly one place at a time, so the registry wrappers no longer need a live+
// placeholder split — the body is the same everywhere.

import type { ReactNode } from 'react'
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
import type { SimulationControls } from '@/sim/use-simulation-loop'
import type { WidgetId } from '@/store'

export interface WidgetRenderProps {
	controls: SimulationControls
	onReset: () => void
	/** True when this is a popped copy docked on the viewport. */
	dockedOnViewport?: boolean
}

/** Render the body of a widget kind (used by the panel panes and the viewport
 *  widgets layer so they never drift apart). */
export function renderWidget(widget: WidgetId, props: WidgetRenderProps): ReactNode {
	switch (widget) {
		case 'sensors.lidar':
			return <LidarWidget />
		case 'sensors.camera.controls':
			return <CameraControlsWidget />
		case 'sensors.camera.feed':
			return <CameraFeedWidget dockedOnViewport={props.dockedOnViewport} />
		case 'map.controls':
			return <MapControlsWidget />
		case 'map.minimap':
			return <MinimapWidget dockedOnViewport={props.dockedOnViewport} />
		case 'nav.navigation':
			return <NavigationWidget controls={props.controls} />
		case 'nav.localization':
			return <LocalizationWidget />
		case 'teleop.controls':
			return <TeleopWidget controls={props.controls} />
		case 'utils.robotDebug':
			return <RobotDebugWidget onReset={props.onReset} />
		case 'utils.logs':
			return <LogsWidget />
		default:
			return null
	}
}
