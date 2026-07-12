// Lidar widget (Sensors tab) — docs/hud.md.
//
// The lidar sliders + the `Lidar` visualization toggle. All control text /
// labels / slider ranges are kept byte-for-byte from the original HUD; only the
// header chrome moved into `WidgetCard`. The camera toggle / noise control live
// in the separate `CameraControlsWidget` / `CameraFeedWidget` (also in the
// Sensors tab).

import { createLidarConfig } from '@robotics-lab/sensors'
import { Button } from '@/components/ui/button'
import { WidgetCard } from '@/components/widgets/widget-card'
import { useSimulatorStore } from '@/store'

const fmt = (n: number) => n.toFixed(2)
const deg = (rad: number) => `${((rad * 180) / Math.PI).toFixed(0)}°`

export function LidarWidget() {
	const lidar = useSimulatorStore((s) => s.lidar)
	const setLidar = useSimulatorStore((s) => s.setLidar)
	const showLidar = useSimulatorStore((s) => s.showLidar)
	const toggleLidar = useSimulatorStore((s) => s.toggleLidar)

	const update = (patch: Partial<typeof lidar>) =>
		setLidar(createLidarConfig({ ...lidar, ...patch }))

	return (
		<WidgetCard title="Sensors" widget="sensors.lidar" bodyClassName="gap-3">
			<div className="flex items-center justify-end">
				<Button
					variant={showLidar ? 'default' : 'outline'}
					size="xs"
					onClick={toggleLidar}
					data-testid="lidar-toggle"
				>
					Lidar
				</Button>
			</div>

			<div className="flex flex-col gap-1">
				<span className="text-muted-foreground text-xs">Range</span>
				<div className="flex items-center gap-2">
					<input
						type="range"
						min={1}
						max={20}
						step={0.5}
						value={lidar.range}
						onChange={(e) => update({ range: Number(e.target.value) })}
						aria-label="Lidar range"
						className="h-1 flex-1 cursor-pointer accent-primary"
					/>
					<span className="w-14 text-right font-mono text-foreground text-xs">
						{fmt(lidar.range)} m
					</span>
				</div>
			</div>

			<div className="flex flex-col gap-1">
				<span className="text-muted-foreground text-xs">Resolution (rays)</span>
				<div className="flex items-center gap-2">
					<input
						type="range"
						min={8}
						max={720}
						step={8}
						value={lidar.rayCount}
						onChange={(e) => update({ rayCount: Number(e.target.value) })}
						aria-label="Lidar resolution"
						className="h-1 flex-1 cursor-pointer accent-primary"
					/>
					<span className="w-14 text-right font-mono text-foreground text-xs">
						{lidar.rayCount}
					</span>
				</div>
			</div>

			<div className="flex flex-col gap-1">
				<span className="text-muted-foreground text-xs">Field of view</span>
				<div className="flex items-center gap-2">
					<input
						type="range"
						min={Math.PI / 4}
						max={Math.PI * 2}
						step={Math.PI / 12}
						value={lidar.fieldOfView}
						onChange={(e) => update({ fieldOfView: Number(e.target.value) })}
						aria-label="Lidar field of view"
						className="h-1 flex-1 cursor-pointer accent-primary"
					/>
					<span className="w-14 text-right font-mono text-foreground text-xs">
						{deg(lidar.fieldOfView)}
					</span>
				</div>
			</div>

			<div className="flex flex-col gap-1">
				<span className="text-muted-foreground text-xs">Lidar noise</span>
				<div className="flex items-center gap-2">
					<input
						type="range"
						min={0}
						max={0.1}
						step={0.005}
						value={lidar.noise}
						onChange={(e) => update({ noise: Number(e.target.value) })}
						aria-label="Lidar noise"
						className="h-1 flex-1 cursor-pointer accent-primary"
					/>
					<span className="w-14 text-right font-mono text-foreground text-xs">
						{fmt(lidar.noise)}
					</span>
				</div>
			</div>

			<div className="flex flex-col gap-1">
				<span className="text-muted-foreground text-xs">Dropouts</span>
				<div className="flex items-center gap-2">
					<input
						type="range"
						min={0}
						max={0.3}
						step={0.01}
						value={lidar.dropoutRate}
						onChange={(e) => update({ dropoutRate: Number(e.target.value) })}
						aria-label="Lidar dropout rate"
						className="h-1 flex-1 cursor-pointer accent-primary"
					/>
					<span className="w-14 text-right font-mono text-foreground text-xs">
						{fmt(lidar.dropoutRate)}
					</span>
				</div>
			</div>
		</WidgetCard>
	)
}
