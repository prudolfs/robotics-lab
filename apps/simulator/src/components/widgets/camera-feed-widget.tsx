// Camera live-feed widget (Sensors tab + dockable on viewport) — Phase 3.
//
// The robot camera is exposed as **two** widgets per docs/hud.md Phase 3:
//   - `CameraControlsWidget` (this file's sibling) — controls-only pointer.
//   - this `CameraFeedWidget` — the **live feed** (`RobotCameraViewport`),
//     gated by the `Cam` on/off toggle. It carries its own drag handle so the
//     live stream can be dragged out onto a viewport edge.
//
// With the "move, not duplicate" model there is ever only one rendered copy
// of this widget — it lives in the panel when docked-in-panel, or in the popped
// layer when docked on the viewport. Either way it owns the single live canvas.
//
// The pitch (camera look-up/down) is local state owned here.

import { RobotCameraViewport } from '@robotics-lab/rendering'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { WidgetCard } from '@/components/widgets/widget-card'
import { useSimulatorStore, type WidgetId } from '@/store'

const WIDGET: WidgetId = 'sensors.camera.feed'

export type CameraFeedWidgetProps = {
	/** True when this is the popped copy docked on the viewport. (Unused now
	 *  under the move model — one body everywhere — but kept for registry API
	 *  symmetry.) */
	dockedOnViewport?: boolean
	/** Width/height for the live viewport, in px. */
	width?: number
	height?: number
}

export function CameraFeedWidget({ width = 256, height = 192 }: CameraFeedWidgetProps) {
	const showCamera = useSimulatorStore((s) => s.showCamera)
	const toggleCamera = useSimulatorStore((s) => s.toggleCamera)
	const cameraNoise = useSimulatorStore((s) => s.cameraNoise)
	const cycleCameraNoise = useSimulatorStore((s) => s.cycleCameraNoise)
	const world = useSimulatorStore((s) => s.world)
	const robot = useSimulatorStore((s) => s.robot)
	const [pitch, setPitch] = useState(0)

	return (
		<WidgetCard
			title="Camera feed"
			widget={WIDGET}
			data-testid="camera-feed-widget"
			bodyClassName="gap-2"
		>
			<div className="flex items-center justify-between">
				<span className="text-muted-foreground text-xs">Live feed</span>
				<div className="flex items-center gap-1">
					<Button
						variant={showCamera ? 'default' : 'outline'}
						size="xs"
						onClick={toggleCamera}
						data-testid="camera-toggle"
					>
						Cam
					</Button>
					<Button
						variant="outline"
						size="xs"
						onClick={cycleCameraNoise}
						data-testid="camera-noise-button"
					>
						{cameraNoise}
					</Button>
				</div>
			</div>

			{!showCamera ? (
				<span className="font-mono text-[10px] text-muted-foreground">
					camera off — press Cam to enable
				</span>
			) : (
				<>
					<RobotCameraViewport
						world={world}
						pose={robot.pose}
						robotParams={robot.params}
						active={true}
						noise={cameraNoise}
						pitch={pitch}
						onPitch={setPitch}
						width={width}
						height={height}
						data-testid="camera-viewport"
						className="overflow-hidden rounded-md border border-border bg-black/80"
					/>
					<span className="font-mono text-[10px] text-muted-foreground">
						drag the camera pane to look up / down
					</span>
				</>
			)}
		</WidgetCard>
	)
}
