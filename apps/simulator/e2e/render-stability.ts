// Phase 9 — Render-stability (liveness) helpers.
//
// Goal (docs/e2e.md, Phase 9): guarantee the app stays responsive during a long
// run. Unlike Phase 7's soft perf budgets and Phase 8's hard memory-leak gate,
// Phase 9 is a *hard* responsiveness gate by design — its pass criteria are an
// observable shape, not a magnitude:
//
//   - application stays responsive   → the render loop keeps producing frames
//                                     (FPS > 0) and the sim clock keeps
//                                     advancing over the run
//   - no WebGL context loss         → owned by the Phase 6 console guard
//                                     (it fails hard on any `WebGL … context`
//                                     console message and is installed in
//                                     beforeEach of the spec)
//   - no crashes                    → owned by the Phase 6 console guard for
//                                     synthetic errors; a real page/renderer
//                                     crash surfaces as a rejected page.*
//                                     call during the sampling loop and fails
//                                     the test before the verdict runs
//   - no unhandled exceptions       → owned by the Phase 6 console guard
//                                     (it fails hard on `pageerror`)
//
// The single signal this helper owes the spec is therefore *liveness*: take
// periodic samples of the two HUD readouts the app already exposes for the
// user — `fps-counter` (render loop alive) and `sim-time` (integrator running)
// — and report them so the spec can assert they never go to zero / stall.
//
// Artifacts: `e2e/.results/render-metrics.json` accumulates one row per
// recorded session so CI can trend liveness across runs. The writer is flushed
// at the end of the spec (mirrors the Phase 7 perf + Phase 8 memory artifact
// pattern exactly).

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { TestInfo } from '@playwright/test'

export const RENDER_ARTIFACT = 'e2e/.results/render-metrics.json'

/** A single liveness probe from the HUD readouts. */
export type RenderSample = {
	/** Monotonic sample index (0-based). */
	i: number
	/** Wall-clock ms since the sampler started (first sample is ~0). */
	elapsedMs: number
	/** FPS as reported by the `fps-counter` HUD readout, or null when the
	 *  readout wasn't parseable for that probe. */
	fps: number | null
	/** Simulation clock (seconds) from the `sim-time` HUD readout, or null
	 *  when the readout wasn't parseable. */
	simTime: number | null
}

export type RenderReport = {
	scenario: string
	/** Wall-clock duration of the run in ms. */
	durationMs: number
	/** Per-probe liveness samples, in collection order. */
	samples: RenderSample[]
	/** Minimum FPS over all usable (non-null) samples. */
	fpsMin: number | null
	/** Median FPS over all usable samples. */
	fpsMedian: number | null
	/** Maximum FPS over all usable samples. */
	fpsMax: number | null
	/** First usable sim-clock reading (seconds), or null. */
	clockFirst: number | null
	/** Last usable sim-clock reading (seconds), or null. */
	clockLast: number | null
	/** True when the clock advanced between first and last usable readings;
	 *  null when there were fewer than two usable readings. */
	clockAdvanced: boolean | null
	/** Human-readable warnings raised by the evaluator (never fatal on their
	 *  own — only the spec's assertions decide fail/pass). */
	warnings: string[]
	/** Overall verdict: no stalled samples and clock advanced. */
	passed: boolean
	/** ISO timestamp so artifact rows are trendable across CI runs. */
	timestamp: string
	/** CI-friendly git ref when available (passed via env). */
	ref: string | null
}

/** Module-scope registry, flushed once after the spec by
 *  `writeRenderMetrics()`. */
const reports: RenderReport[] = []

/** Record a render-stability report and surface it on the Playwright report. */
export function recordRenderReport(report: RenderReport, info: TestInfo): RenderReport {
	reports.push(report)
	info.attach('render-metric.json', {
		body: JSON.stringify(report, null, 2),
		contentType: 'application/json',
	})
	info.annotations.push(
		{
			type: `fps ${report.fpsMedian?.toFixed(0) ?? '?'}`,
			description: report.passed ? 'ok' : 'FAIL: render loop stalled',
		},
		{
			type: `fpsMin ${report.fpsMin?.toFixed(0) ?? '?'}`,
			description: report.passed ? 'ok' : 'render loop produced zero frames at least once',
		},
		{
			type: `clock ${report.clockFirst?.toFixed(1) ?? '?'}→${report.clockLast?.toFixed(1) ?? '?'}`,
			description: report.clockAdvanced === false ? 'FAIL: sim clock did not advance' : 'ok',
		},
	)
	const _verdict = report.passed ? 'PASS' : 'FAIL'
	for (const w of report.warnings) console.warn(`[render] ${report.scenario}: ${w}`)

	return report
}

/** Append accumulated reports to the JSON artifact (concurrent-safe, append-first). */
export async function writeRenderMetrics(): Promise<void> {
	const target = artifactPath()
	const existing = await readArtifact()
	const merged = [...existing, ...reports]
	await mkdir(dirname(target), { recursive: true })
	await writeFile(target, `${JSON.stringify(merged, null, 2)}\n`)
}

async function readArtifact(): Promise<RenderReport[]> {
	try {
		const raw = await readFile(artifactPath(), 'utf8')
		return JSON.parse(raw) ?? []
	} catch {
		return []
	}
}

/** Resolve the artifact path absolutely (same trick as metrics.ts / memory.ts). */
function artifactPath(): string {
	const here = dirname(fileURLToPath(import.meta.url))
	return `${here}/${RENDER_ARTIFACT.replace(/^e2e\//, '')}`
}
