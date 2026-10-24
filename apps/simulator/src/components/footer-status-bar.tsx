// Footer status bar (docs/hud.md Phase 3).
//
// A fixed 32px (h-8) footer holding the sim time, FPS, status and a version
// tag — folding in the formerly top-left readouts (`fps-counter`, `sim-time`).
// Their `data-testid`s are preserved so existing tests / fixtures stay green.
//
// FPS is observed from the store (App.tsx's <FpsCounter> pushes it there) so
// the footer stays self-contained and has its own render source.

import { useSimulatorStore } from '@/store'

export function FooterStatusBar() {
	const simTime = useSimulatorStore((s) => s.simTime)
	const fps = useSimulatorStore((s) => s.fps)
	const running = useSimulatorStore((s) => s.running)
	const autonomous = useSimulatorStore((s) => s.autonomous)

	const navStatus = useSimulatorStore((s) => s.navStatus)
	const collision = useSimulatorStore((s) => s.collision)
	const algorithm = useSimulatorStore((s) => s.planner.algorithm)
	const status = !running
		? 'PAUSED'
		: collision
			? 'CONTACT: STOPPED'
			: autonomous
				? navStatus === 'blocked'
					? 'BLOCKED'
					: `${algorithm === 'dijkstra' ? 'DIJKSTRA' : 'A*'}: ${navStatus.toUpperCase()}`
				: 'MANUAL'

	return (
		<footer
			data-testid="footer-status-bar"
			className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex h-8 items-center justify-between border-border border-t bg-card px-5 text-[11px] text-muted-foreground backdrop-blur-md"
		>
			<div className="flex items-center gap-4">
				<span data-testid="sim-time">
					<span className="text-primary">SIM_TIME:</span> {fmtTime(simTime)}
				</span>
				<span data-testid="fps-counter">FPS: {fps}</span>
				<span>
					<span className="text-primary">STATUS:</span> {status}
				</span>
			</div>
			<div className="flex items-center gap-4">
				<span className="text-[10px] text-primary max-[700px]:hidden">
					Violet line: planned route
				</span>
				<span
					data-testid="navigation-summary"
					className="font-semibold text-foreground uppercase tracking-wider"
				>
					{status}
				</span>
			</div>
		</footer>
	)
}

/** Format seconds as HH:MM:SS.cc (the reference footer format). */
function fmtTime(seconds: number): string {
	const s = Math.max(0, seconds)
	const hh = Math.floor(s / 3600)
	const mm = Math.floor((s % 3600) / 60)
	const ss = Math.floor(s % 60)
	const cc = Math.floor((s - Math.floor(s)) * 100)
	const pad = (n: number, w = 2) => String(n).padStart(w, '0')
	return `${pad(hh)}:${pad(mm)}:${pad(ss)}.${pad(cc)}`
}
