// Sensor HUD: lidar configuration, visualization toggle and the robot camera
// viewport control surface (milestone 5).
//
// The HUD only reads/writes Zustand app state and owns no simulation state.
// The lidar scan itself is observed in the store; lidar config (range,
// resolution, FOV, noise) is app state the simulation loop pushes onto the
// sim each frame. The robot camera viewport div lives in `App.tsx` because it
// must sit outside the `<Canvas>`; this HUD only owns the on/off toggle and
// the look controls.

import { createLidarConfig } from '@robotics-lab/sensors'
import { Button } from '@/components/ui/button'
import { useSimulatorStore } from '@/store'

const fmt = (n: number) => n.toFixed(2)
const deg = (rad: number) => `${((rad * 180) / Math.PI).toFixed(0)}°`

export function SensorHud() {
	const lidar = useSimulatorStore((s) => s.lidar)
	const setLidar = useSimulatorStore((s) => s.setLidar)
	const showLidar = useSimulatorStore((s) => s.showLidar)
	const toggleLidar = useSimulatorStore((s) => s.toggleLidar)
	const showCamera = useSimulatorStore((s) => s.showCamera)
	const toggleCamera = useSimulatorStore((s) => s.toggleCamera)

	const update = (patch: Partial<typeof lidar>) =>
		setLidar(createLidarConfig({ ...lidar, ...patch }))

	return (
		<div className="pointer-events-auto absolute top-4 right-4 flex w-64 flex-col gap-3 rounded-lg border border-border bg-card/80 p-3 backdrop-blur-sm">
			<div className="flex items-center justify-between">
				<span className="font-semibold text-foreground text-sm">Sensors</span>
				<div className="flex gap-1">
					<ToggleButton label="Lidar" active={showLidar} onClick={toggleLidar} data-testid="lidar-toggle" />
					<ToggleButton label="Cam" active={showCamera} onClick={toggleCamera} data-testid="camera-toggle" />
				</div>
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
				<span className="text-muted-foreground text-xs">Noise</span>
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

			{showCamera && (
				<span className="font-mono text-[10px] text-muted-foreground">
					drag the camera pane to look up / down
				</span>
			)}
		</div>
	)
}

function ToggleButton({
	label,
	active,
	onClick,
	'data-testid': testId,
}: {
	label: string
	active: boolean
	onClick: () => void
	'data-testid'?: string
}) {
	return (
		<Button variant={active ? 'default' : 'outline'} size="xs" onClick={onClick} data-testid={testId}>
			{label}
		</Button>
	)
}
