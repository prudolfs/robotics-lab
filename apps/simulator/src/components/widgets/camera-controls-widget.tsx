// Camera controls widget (Sensors tab) — Phase 3 of docs/hud.md.
//
// The robot camera is split into two widgets (see docs Phase 3): this
// controls-only card (`sensors.camera.controls`) and the live-feed card
// `CameraFeedWidget`. The `Cam` on/off toggle and image-noise cycle both live
// on the feed card so the controls sit beside the live viewport they affect.
// This controls card is kept as a thin "camera is feed-only" pointer so the
// Sensors tab still reads as complete and offers its own drag handle to pop
// a dedicated camera panel out (the feed can be popped separately).

import { WidgetCard } from '@/components/widgets/widget-card'
import type { WidgetId } from '@/store'

const WIDGET: WidgetId = 'sensors.camera.controls'

export function CameraControlsWidget() {
	return (
		<WidgetCard title="Camera" widget={WIDGET} bodyClassName="gap-2">
			<span className="font-mono text-[10px] text-muted-foreground">
				camera toggle + noise live on the Camera feed card
			</span>
		</WidgetCard>
	)
}
