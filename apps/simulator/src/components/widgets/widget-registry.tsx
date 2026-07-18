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
import { PerformanceWidget } from '@/components/widgets/performance-widget'
import { PlaybackWidget } from '@/components/widgets/playback-widget'
import { RobotDebugWidget } from '@/components/widgets/robot-debug-widget'
import { RobotEditorWidget } from '@/components/widgets/robot-editor-widget'
import { RobotInspectorWidget } from '@/components/widgets/robot-inspector-widget'
import { SensorInspectorWidget } from '@/components/widgets/sensor-inspector-widget'
import { StatisticsWidget } from '@/components/widgets/statistics-widget'
import { TeleopWidget } from '@/components/widgets/teleop-widget'
import { TogglesWidget } from '@/components/widgets/toggles-widget'
import { WorldEditorWidget } from '@/components/widgets/world-editor-widget'
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
		case 'editor.world':
			return <WorldEditorWidget />
		case 'editor.robot':
			return <RobotEditorWidget controls={props.controls} />
		case 'playback.controls':
			return <PlaybackWidget />
		case 'inspect.robot':
			return <RobotInspectorWidget />
		case 'inspect.sensors':
			return <SensorInspectorWidget />
		case 'inspect.stats':
			return <StatisticsWidget />
		case 'inspect.perf':
			return <PerformanceWidget />
		case 'inspect.toggles':
			return <TogglesWidget />
		default:
			return null
	}
}
