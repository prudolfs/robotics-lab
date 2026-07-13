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

	const status = !running ? 'PAUSED' : autonomous ? 'AUTO' : 'MANUAL'

	return (
		<footer
			data-testid="footer-status-bar"
			className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex h-8 items-center justify-between border-border border-t bg-card/80 px-3 font-mono text-[11px] text-muted-foreground backdrop-blur-md"
		>
			<div className="flex items-center gap-4">
				<span data-testid="sim-time">
					<span className="text-emerald-500">SIM_TIME:</span> {fmtTime(simTime)}
				</span>
				<span data-testid="fps-counter">FPS: {fps}</span>
				<span>
					<span className="text-emerald-500">STATUS:</span> {status}
				</span>
			</div>
			<div className="flex items-center gap-4">
				<span className="text-[10px] uppercase tracking-wider">v2.4.0-dev</span>
				<span className="font-semibold text-foreground uppercase tracking-wider">{status}</span>
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
