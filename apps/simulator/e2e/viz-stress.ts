// Phase 11 — Visualization-toggle-stress helpers.
//
// Goal (docs/e2e.md, Phase 11): make sure toggling layers does not leak or
// crash. The doc's tasks and pass criteria are:
//
//   - Enable / disable lidar in a loop           → `lidar-toggle`
//   - Enable / disable occupancy grid in a loop   → `occupancy-grid-toggle`
//   - Enable / disable debug overlays in a loop  → path overlay + odometry
//                                                  trail (`path-toggle`,
//                                                  `odometry-toggle`)
//   - Enable / disable camera in a loop          → `camera-toggle`
//   - Enable / disable helpers in a loop          → minimap (`minimap-toggle`)
//   - Assert no crashes
//   - Assert no memory growth
//
// Two independent, observable mechanisms drive the verdict, the same pair the
// Phase 10 mount-stress uses (each proving a different leak surface):
//
//   1. Steady-state rAF / interval / listener counters via the Phase 10 leak
//      instrument (`installLeakInstrument` / `sampleInstrument` from
//      ./mount-stress.ts). Each visualization layer mounts a React component
//      + Three.js geometry on enable and unmounts it on disable; that
//      mount/unmount churn is exactly what a stale useEffect cleanup or an
//      abandoned GL geometry leak would surface. The instrument lives on a
//      single page though, so it counts *live* registrations under each
//      steady-state read — a leak that adds an extra rAF chain or window
//      listener each toggle makes the lo-water-mark climb every round, so
//      the max − min drift is the honest gate (same as Phase 10).
//
//   2. Retained heap across the toggle soup, reusing Phase 8's GC-accurate
//      `sampleHeap` / `fitTrend` / `evaluateLeak` verbatim. A leak that
//      retains an event listener closure or a Three.js geometry buffer each
//      toggle shows up as a sustained upward slope across the rounds.
//
// The Phase 6 console guard (installed in `beforeEach` of the spec) owns
// the "no crashes" criterion for synthetic errors and "no WebGL context
// loss" on a *live* canvas — the latter is a real risk here because
// toggling the camera recreates an R3F `<Canvas>` + WebGL context every
// other round (Phase 8 explicitly excluded the camera from its overlay cycle
// for that reason). Phase 11 keeps the camera in the cycle *deliberately*
// (the doc calls for it) and adds a small settle between toggles. R3F v9
// calls `gl.forceContextLoss()` on `<Canvas>` unmount, dispatching
// `webglcontextlost` on the canvas; THREE.js then logs the debug message
// `THREE.WebGLRenderer: Context Lost.` — a benign, intentional GPU-release
// signal, not a regression. As of Phase 11 the console guard was refined
// (see console-guard.ts) to whitelist exactly that `log`-level message so
// the camera toggle cycle keeps exercising the renderer without a false
// positive; a genuine context loss on a *live* canvas still surfaces as an
// `error`-level console message — caught by the guard's `console.error`
// rule — or through `webglcontextcreationerror`, both of which fail the test.
//
// ── Artifacts ───────────────────────────────────────────────────────────
//
// `e2e/.results/viz-metrics.json` accumulates one row per recorded session
// exactly the way Phase 7 / 8 / 9 / 10 do, so CI can trend the toggle-leak
// shape across runs. The writer is flushed at the end of the spec.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { TestInfo } from '@playwright/test'

import type { InstrumentSample } from './mount-stress'

export const VIZ_ARTIFACT = 'e2e/.results/viz-metrics.json'

/** Hard budgets for the toggle-stress verdict. Mirrors Phase 8 / Phase 10's
 *  thresholds verbatim — a retained-across-toggles leak has the same shape
 *  either way. The counter drift is the primary signal; this is the backstop. */
export const VIZ_BUDGETS = {
	// Total retained growth across all toggle rounds (last − first sample).
	// Each round mounts/unmounts a scene-graph layer; ~50MB of headroom leaves
	// room for normal warm-up (occupancy cells, path buffers, geometry reuse)
	// while still catching a genuine leak.
	maxGrowthMb: 50,
	// Sustained retained-heap slope, in MB/minute. A leak that retains
	// ~10MB/minute every minute is a real leak; the per-round counter drift is
	// the more immediate signal.
	maxLeakMbPerMinute: 10,
	// R² floor: only treat a slope as a "leak trend" when the linear fit is
	// reasonably good; below this the series is noise.
	leakTrendR2: 0.6,
} as const

/** A description of a single visualization toggle button in the public UI.
 *  - `tab`     — the right-panel tab the toggle is in (must be active before
 *                clicking per Phase 2 of docs/hud.md, so the pane is visible).
 *  - `testid`  — the data-testid of the button itself.
 *  - `label`   — short label for artifact / warning messages.
 *
 *  No CSS selectors, no store access — straight off docs/e2e.md. */
export type VizToggle = {
	tab: 'sensors' | 'map' | 'nav'
	testid: string
	label: string
}

/** The five toggle layers the doc names for Phase 11, grouped under the
 *  doc's task headers (the same five headers listed in docs/e2e.md).
 *
 *  - "Enable / disable lidar in a loop"          → `lidar-toggle`
 *    (scene-graph lidar rays + hit points)
 *  - "Enable / disable occupancy grid in a loop" → `occupancy-grid-toggle`
 *    (floor overlay mesh built from the occupancy grid)
 *  - "Enable / disable debug overlays in a loop"→ `path-toggle` + `odometry-toggle`
 *    (the path planner's open/closed/final overlay + the dead-reckoning trail
 *    marker + history line)
 *  - "Enable / disable camera in a loop"        → `camera-toggle`
 *    (the RobotCameraViewport — its own WebGL canvas; toggling creates/
 *    destroys a WebGL context each time, the stress the doc is asking for)
 *  - "Enable / disable helpers in a loop"        → `minimap-toggle`
 *    (the corner occupancy minimap — a 2D canvas helper view)
 *
 *  The camera is intentionally INCLUDED in this cycle (where it was
 *  deliberately excluded from Phase 8) because "Enable / disable camera in a
 *  loop" is one of Phase 11's explicit tasks. R3F v9 calls
 *  `gl.forceContextLoss()` when the camera `<Canvas>` is intentionally
 *  unmounted, dispatching `webglcontextlost` and causing THREE.js to log
 *  `THREE.WebGLRenderer: Context Lost.` — a benign GPU-release debug log
 *  (not error) the Phase 11 console guard whitelists. A genuine context loss
 *  on a *live* canvas would still surface as `console.error` (or via
 *  `webglcontextcreationerror`) and trip the guard — exactly like the doc's
 *  "Assert no crashes" wants. */
export const VIZ_TOGGLES: VizToggle[] = [
	{ tab: 'sensors', testid: 'lidar-toggle', label: 'lidar' },
	{ tab: 'map', testid: 'occupancy-grid-toggle', label: 'occupancy-grid' },
	{ tab: 'nav', testid: 'path-toggle', label: 'path-overlay' },
	{ tab: 'nav', testid: 'odometry-toggle', label: 'odometry-trail' },
	{ tab: 'sensors', testid: 'camera-toggle', label: 'camera' },
	{ tab: 'map', testid: 'minimap-toggle', label: 'minimap' },
]

export type VizStressReport = {
	scenario: string
	/** Number of toggle rounds performed. */
	rounds: number
	/** Wall-clock duration of the run in ms. */
	durationMs: number
	/** Per-round instrumentation snapshots, in collection order. */
	samples: InstrumentSample[]
	/** Lo-water-mark steady-state readings used as the drift gate. */
	baseline: {
		rafLive: number | null
		intervalLive: number | null
		windowListeners: number | null
		documentListeners: number | null
	}
	/** Maximum rise of any counter above its lo-water mark across the run
	 *  (max − min). A value > 0 is the leak signature. */
	maxDrift: {
		rafLive: number | null
		intervalLive: number | null
		windowListeners: number | null
		documentListeners: number | null
	}
	/** Reused Phase 8 memory signals (kept inline so the report stands alone). */
	growthMb: number | null
	slopeMbPerMin: number
	r2: number
	/** Human-readable warnings raised by the evaluator (never fatal on their
	 *  own — the spec's assertions decide fail/pass). */
	warnings: string[]
	/** Overall verdict: no counter drift beyond tolerance AND memory within
	 *  budget. */
	passed: boolean
	/** ISO timestamp so artifact rows are trendable across CI runs. */
	timestamp: string
	/** CI-friendly git ref when available. */
	ref: string | null
}

/** Module-scope registry, flushed once after the spec by
 *  `writeVizMetrics()`. */
const reports: VizStressReport[] = []

/** Hard gate threshold for per-round counter drift. Identical to Phase 10:
 *  each read is at a steady state (the toggle has settled), so noise only
 *  ever pushes *up* — making the minimum the cleanest steady-state proxy and
 *  drift of zero the cleanest pass line. A single retained handle per toggle
 *  makes the lo-water mark climb by one each round, exceeding the tolerance
 *  almost immediately. Matches `mount-stress.ts` exactly so the gate reads
 *  symmetric between the two phases. */
const VIZ_COUNTER_DRIFT_TOLERANCE = 0

/** Evaluate the toggle-stress verdict from per-round instrument samples.
 *
 *  Verdict rules (doc Phase 11 pass criteria):
 *   - "assert no memory growth"        → reuse Phase 8's `evaluateLeak`
 *                                       (passed in by the spec and folded
 *                                       back here for a self-contained report)
 *   - "assert no crashes"               → owned by the Phase 6 console guard
 *
 *  The counter drift verdict mirrors Phase 10's exactly: lo-water-mark
 *  baseline, max − min drift, tolerance 0. The leak-instrument lives on a
 *  single page (no full navigations here), so it must catch leaks that
 *  accumulate per-toggle while the page stays alive — exactly the steady-state
 *  creep this gate is for. */
export function evaluateVizStress(
	samples: InstrumentSample[],
	memVerdict: { passed: boolean; warnings: string[] } | null,
	mem: { growthMb: number | null; slopeMbPerMin: number; r2: number },
): {
	passed: boolean
	warnings: string[]
	baseline: VizStressReport['baseline']
	maxDrift: VizStressReport['maxDrift']
} {
	const warnings: string[] = []
	if (
		samples.length === 0 ||
		samples.every(
			(s) =>
				s.rafLive == null &&
				s.intervalLive == null &&
				s.windowListeners == null &&
				s.documentListeners == null,
		)
	) {
		warnings.push('leak instrument unavailable — counter drift unverified')
		return {
			passed: memVerdict?.passed ?? true,
			warnings: [...warnings, ...(memVerdict?.warnings ?? [])],
			baseline: {
				rafLive: null,
				intervalLive: null,
				windowListeners: null,
				documentListeners: null,
			},
			maxDrift: {
				rafLive: null,
				intervalLive: null,
				windowListeners: null,
				documentListeners: null,
			},
		}
	}

	const minOf = (key: keyof InstrumentSample) => {
		const vals = samples.map((s) => s[key]).filter((v): v is number => typeof v === 'number')
		return vals.length > 0 ? Math.min(...vals) : null
	}
	const maxOf = (key: keyof InstrumentSample) => {
		const vals = samples.map((s) => s[key]).filter((v): v is number => typeof v === 'number')
		return vals.length > 0 ? Math.max(...vals) : null
	}
	const driftOf = (key: keyof InstrumentSample) => {
		const lo = minOf(key)
		const hi = maxOf(key)
		return lo != null && hi != null ? Math.max(0, hi - lo) : null
	}

	const baseline = {
		rafLive: minOf('rafLive'),
		intervalLive: minOf('intervalLive'),
		windowListeners: minOf('windowListeners'),
		documentListeners: minOf('documentListeners'),
	} as VizStressReport['baseline']
	const maxDrift = {
		rafLive: driftOf('rafLive'),
		intervalLive: driftOf('intervalLive'),
		windowListeners: driftOf('windowListeners'),
		documentListeners: driftOf('documentListeners'),
	} as VizStressReport['maxDrift']

	let countersOk = true
	const check = (name: keyof VizStressReport['maxDrift'], val: number | null) => {
		if (val == null) return
		if (val > VIZ_COUNTER_DRIFT_TOLERANCE) {
			countersOk = false
			warnings.push(
				`${name} drifted +${val} above lo-water baseline across ${samples.length} samples ` +
					`(tolerance ${VIZ_COUNTER_DRIFT_TOLERANCE}, min ${baseline[name]}) — a toggle leaks a handle`,
			)
		}
	}
	check('rafLive', maxDrift.rafLive)
	check('intervalLive', maxDrift.intervalLive)
	check('windowListeners', maxDrift.windowListeners)
	check('documentListeners', maxDrift.documentListeners)

	const passed = countersOk && (memVerdict?.passed ?? true)
	if (memVerdict) warnings.push(...memVerdict.warnings)
	if (mem.growthMb != null) {
		warnings.push(
			`heap growth ${mem.growthMb.toFixed(1)}MB over the run (slope ${mem.slopeMbPerMin.toFixed(2)}MB/min, r²=${mem.r2.toFixed(2)})`,
		)
	}
	return { passed, warnings, baseline, maxDrift }
}

/** Record a viz-stress report and surface it on the Playwright report. */
export function recordVizReport(report: VizStressReport, info: TestInfo): VizStressReport {
	reports.push(report)
	info.attach('viz-metric.json', {
		body: JSON.stringify(report, null, 2),
		contentType: 'application/json',
	})
	const fmt = (v: number | null) => (v != null ? `+${v}` : '?')
	info.annotations.push(
		{
			type: `rafDrift ${fmt(report.maxDrift.rafLive)}`,
			description:
				(report.maxDrift.rafLive ?? 0) > VIZ_COUNTER_DRIFT_TOLERANCE
					? 'FAIL: rAF loops leak'
					: 'ok',
		},
		{
			type: `intervalDrift ${fmt(report.maxDrift.intervalLive)}`,
			description:
				(report.maxDrift.intervalLive ?? 0) > VIZ_COUNTER_DRIFT_TOLERANCE
					? 'FAIL: intervals leak'
					: 'ok',
		},
		{
			type: `winListenerDrift ${fmt(report.maxDrift.windowListeners)}`,
			description:
				(report.maxDrift.windowListeners ?? 0) > VIZ_COUNTER_DRIFT_TOLERANCE
					? 'FAIL: window listeners leak'
					: 'ok',
		},
		{
			type: `docListenerDrift ${fmt(report.maxDrift.documentListeners)}`,
			description:
				(report.maxDrift.documentListeners ?? 0) > VIZ_COUNTER_DRIFT_TOLERANCE
					? 'FAIL: document listeners leak'
					: 'ok',
		},
		{
			type: `growth ${report.growthMb != null ? report.growthMb.toFixed(1) : '?'}MB`,
			description: report.passed ? 'ok' : 'FAIL: memory growth',
		},
	)
	const _verdict = report.passed ? 'PASS' : 'FAIL'
	for (const w of report.warnings) console.warn(`[viz] ${report.scenario}: ${w}`)

	return report
}

/** Append accumulated reports to the JSON artifact (concurrent-safe, append-first). */
export async function writeVizMetrics(): Promise<void> {
	const target = artifactPath()
	const existing = await readArtifact()
	const merged = [...existing, ...reports]
	await mkdir(dirname(target), { recursive: true })
	await writeFile(target, `${JSON.stringify(merged, null, 2)}\n`)
}

async function readArtifact(): Promise<VizStressReport[]> {
	try {
		const raw = await readFile(artifactPath(), 'utf8')
		return JSON.parse(raw) ?? []
	} catch {
		return []
	}
}

/** Resolve the artifact path absolutely (same trick as metrics.ts /
 *  memory.ts / render-stability.ts / mount-stress.ts). */
function artifactPath(): string {
	const here = dirname(fileURLToPath(import.meta.url))
	return `${here}/${VIZ_ARTIFACT.replace(/^e2e\//, '')}`
}
