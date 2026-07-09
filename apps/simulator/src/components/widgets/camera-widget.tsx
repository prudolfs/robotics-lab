// Camera widget (Sensors tab) — Phase 2 of docs/hud.md.
//
// Wraps the robot-camera control surface from the old `SensorHud`: the `Cam`
// on/off toggle and the `Camera noise` cycle button, plus the "drag the camera
// pane to look up / down" hint shown when the viewport is open. All text is
// kept byte-for-byte from `SensorHud`.
//
// The robot camera viewport *canvas* itself (`RobotCameraViewport`) stays
// mounted in `App.tsx` because it must sit outside `<Canvas>`; a popped-out
// "camera" copy would be controls-only (no second live WebGL feed). This
// widget is therefore controls-only — flipping the `Cam` toggle gates the
// floater in `App.tsx`.

import { Button } from '@/components/ui/button'
import { WidgetCard } from '@/components/widgets/widget-card'
import { useSimulatorStore } from '@/store'

export function CameraWidget() {
	const showCamera = useSimulatorStore((s) => s.showCamera)
	const toggleCamera = useSimulatorStore((s) => s.toggleCamera)
	const cameraNoise = useSimulatorStore((s) => s.cameraNoise)
	const cycleCameraNoise = useSimulatorStore((s) => s.cycleCameraNoise)

	return (
		<WidgetCard title="Camera" bodyClassName="gap-3">
			<div className="flex items-center justify-between">
				<span className="text-muted-foreground text-xs">Viewport</span>
				<Button
					variant={showCamera ? 'default' : 'outline'}
					size="xs"
					onClick={toggleCamera}
					data-testid="camera-toggle"
				>
					Cam
				</Button>
			</div>

			<div className="flex items-center justify-between">
				<span className="text-muted-foreground text-xs">Camera noise</span>
				<Button
					variant="outline"
					size="xs"
					onClick={cycleCameraNoise}
					data-testid="camera-noise-button"
				>
					{cameraNoise}
				</Button>
			</div>

			{showCamera && (
				<span className="font-mono text-[10px] text-muted-foreground">
					drag the camera pane to look up / down
				</span>
			)}
		</WidgetCard>
	)
}
