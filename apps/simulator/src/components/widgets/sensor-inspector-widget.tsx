// Sensor inspector (Inspect tab) — docs/simulator.md milestone 14.
//
// A live readout of the sensor fleet's configuration + measured output, so a
// glance reads what each sensor sees without diving into its tuning card.
//
//   - Lidar: config (range / rays / FOV / noise / dropouts) + the latest scan
//     stats (hit count, miss count, nearest + mean distance).
//   - Camera: whether the onboard camera is enabled, the current image-noise
//     level, and the camera pitch hint (state lives in the feed widget, so we
//     read only the store-known knobs here).
//
// The widget owns no simulation state: it only reads observed values already
// mirrored into the store (`scan`, `lidar`, `showCamera`, `cameraNoise`).

import type { LidarScan } from '@robotics-lab/sensors'
import { WidgetCard } from '@/components/widgets/widget-card'
import { useSimulatorStore, type WidgetId } from '@/store'

const WIDGET: WidgetId = 'inspect.sensors'
const fmt = (n: number) => n.toFixed(2)
const deg = (rad: number) => `${((rad * 180) / Math.PI).toFixed(0)}°`

type CameraNoiseLevel = 'none' | 'low' | 'medium' | 'high'

export function SensorInspectorWidget() {
	const lidar = useSimulatorStore((s) => s.lidar)
	const scan = useSimulatorStore((s) => s.scan)
	const showCamera = useSimulatorStore((s) => s.showCamera)
	const cameraNoise = useSimulatorStore((s) => s.cameraNoise)

	const stats = scan ? scanStats(scan) : null

	return (
		<WidgetCard
			title="Sensor inspector"
			widget={WIDGET}
			data-testid="sensor-inspector"
			bodyClassName="gap-2"
		>
			<SectionLabel>Lidar</SectionLabel>
			<Row label="range" value={`${fmt(lidar.range)} m`} />
			<Row label="rays" value={`${lidar.rayCount}`} />
			<Row label="field of view" value={deg(lidar.fieldOfView)} />
			<Row label="distance noise" value={fmt(lidar.noise)} />
			<Row label="dropout rate" value={`${(lidar.dropoutRate * 100).toFixed(0)}%`} />
			<Row label="status" value={scan ? 'scanning' : 'no world'} />

			{stats && (
				<>
					<SectionLabel>Latest scan</SectionLabel>
					<Row label="samples" value={`${stats.count}`} />
					<Row label="hits" value={`${stats.hits}`} />
					<Row label="misses" value={`${stats.misses}`} />
					<Row label="nearest" value={stats.nearest != null ? `${fmt(stats.nearest)} m` : '—'} />
					<Row label="mean distance" value={`${fmt(stats.mean)} m`} />
				</>
			)}

			<SectionLabel>Camera</SectionLabel>
			<Row label="enabled" value={showCamera ? 'on' : 'off'} />
			<Row label="image noise" value={cameraNoise} />
		</WidgetCard>
	)
}

function scanStats(scan: LidarScan): {
	count: number
	hits: number
	misses: number
	nearest: number | null
	mean: number
} {
	let hits = 0
	let misses = 0
	let nearest: number | null = null
	let sum = 0
	for (const s of scan.samples) {
		if (s.hit != null) {
			hits++
			sum += s.distance
			if (nearest == null || s.distance < nearest) nearest = s.distance
		} else {
			misses++
			sum += scan.config.range
		}
	}
	const count = scan.samples.length
	return {
		count,
		hits,
		misses,
		nearest,
		mean: count > 0 ? sum / count : 0,
	}
}

function SectionLabel({ children }: { children: React.ReactNode }) {
	return (
		<span className="mt-1 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
			{children}
		</span>
	)
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between gap-2">
			<span className="text-muted-foreground text-xs">{label}</span>
			<span className="font-mono text-foreground text-xs">{value}</span>
		</div>
	)
}

export type { CameraNoiseLevel }
