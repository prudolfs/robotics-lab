// Performance metrics widget (Inspect tab) — docs/simulator.md milestone 14.
//
// Renderer + simulation throughput so a glance reads whether the loop is
// keeping up: the WebGL render FPS (pushed by <FpsCounter>), the fixed-step
// count and how that maps into "sim FPS" (steps/sec), and the sim/real time
// ratio (sim time gained per wall second). Also surfaces the configured fixed
// timestep so the numbers are interpretable.
//
// These are all observed values already in the store (`fps`, `simTime`,
// `stepCount`). The widget derives the runs-per-second ratios from the
// observed deltas it sees between renders, kept in refs.

import { useEffect, useRef, useState } from 'react'
import { WidgetCard } from '@/components/widgets/widget-card'
import { FIXED_DT } from '@/sim/loop'
import { useSimulatorStore, type WidgetId } from '@/store'

const WIDGET: WidgetId = 'inspect.perf'
const fmt = (n: number) => n.toFixed(1)

export function PerformanceWidget() {
	const fps = useSimulatorStore((s) => s.fps)
	const simTime = useSimulatorStore((s) => s.simTime)
	const stepCount = useSimulatorStore((s) => s.stepCount)
	const running = useSimulatorStore((s) => s.running)

	// Rolling sim-steps-per-second (number of fixed steps observed per real
	// second) and sim/real ratio (sim seconds gained per real second).
	const lastRef = useRef<{ t: number; steps: number; sim: number } | null>(null)
	const [simFps, setSimFps] = useState(0)
	const [simRealRatio, setSimRealRatio] = useState(0)
	const [frameMs, setFrameMs] = useState(0)

	useEffect(() => {
		const now = performance.now()
		const last = lastRef.current
		if (last != null) {
			const dt = now - last.t
			if (dt > 0) {
				setSimFps((stepCount - last.steps) / (dt / 1000))
				setSimRealRatio((simTime - last.sim) / (dt / 1000))
				setFrameMs(dt)
			}
		}
		lastRef.current = { t: now, steps: stepCount, sim: simTime }
	}, [stepCount, simTime])

	const stepLoad = simFps * FIXED_DT // sim-seconds produced per real second target
	const targetSimFps = 1 / FIXED_DT
	const headroom = Math.max(0, (1 - simFps / targetSimFps) * 100)

	return (
		<WidgetCard
			title="Performance"
			widget={WIDGET}
			data-testid="performance"
			status={
				<span
					data-testid="perf-status"
					className={
						running
							? 'font-mono text-emerald-500 text-xs'
							: 'font-mono text-muted-foreground text-xs'
					}
				>
					{running ? 'live' : 'paused'}
				</span>
			}
			bodyClassName="gap-2"
		>
			<SectionLabel>Renderer</SectionLabel>
			<Row label="render FPS" value={`${fmt(fps)}`} />
			<Row label="frame time" value={`${fmt(frameMs)} ms`} />

			<SectionLabel>Simulation</SectionLabel>
			<Row label="fixed timestep" value={`${(FIXED_DT * 1000).toFixed(2)} ms`} />
			<Row label="steps captured" value={`${stepCount}`} />
			<Row label="sim FPS" value={`${fmt(simFps)}`} />
			<Row label="target sim FPS" value={`${fmt(targetSimFps)}`} />
			<Row label="headroom" value={`${fmt(headroom)}%`} />

			<SectionLabel>Clock</SectionLabel>
			<Row label="sim time" value={`${fmtTime(simTime)}`} />
			<Row label="sim/real ratio" value={`${fmt(simRealRatio)}×`} />
			<Row label="sim throughput" value={`${fmt(stepLoad)} s/s`} />
		</WidgetCard>
	)
}

const fmtTime = (sec: number) => {
	const s = Math.max(0, Math.floor(sec))
	const hh = Math.floor(s / 3600)
	const mm = Math.floor((s % 3600) / 60)
	const ss = s % 60
	const pad = (n: number) => String(n).padStart(2, '0')
	return `${pad(hh)}:${pad(mm)}:${pad(ss)}`
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
