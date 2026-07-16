// Phase 10 — Mount / unmount stress helpers.
//
// Goal (docs/e2e.md, Phase 10): catch React resource leaks when the scene is
// torn down. The doc's tasks and pass criteria are:
//
//   - Open simulator
//   - Leave page
//   - Return to page
//   - Repeat 30–50 times
//   - Assert no increasing memory
//   - Assert no duplicate event listeners
//   - Assert no additional animation loops
//
// Unlike Phase 8 (sustained interaction over a long session proving *memory*
// doesn't leak) and Phase 9 (long run proving the *render loop stays alive*),
// Phase 10 hammers the *mount / unmount* boundary: each cycle tears the whole
// React / R3F tree down (navigate to about:blank) and rebuilds it (navigate
// back to /) — exactly what a user's "leave page / return to page" does.
//
// ── Observable signals ──────────────────────────────────────────────────
//
// There is no built-in DOM API that returns "how many listeners are attached
// to `window`", and a bare `requestAnimationFrame` wrapper can't tell pending
// frames from already-fired ones, because rAF fires its callback with no
// observable "consumed" marker from outside. To make the pass criteria
// observable we inject a tiny, pure-measurement instrumentation hook *very*
// early via `page.addInitScript` — before the app bundle runs, even on cycle
// 0 — that wraps the scheduling / listener primitives with counter-bearing
// shims and exposes a read-only `window.__E2E_LEAKS__` snapshot:
//
//   window.__E2E_LEAKS__.snapshot() -> {
//     rafLive: number,             // currently-pending rAF handles
//                                    (decrement on fire, increment on schedule;
//                                     the count equals the number of *active*
//                                     rAF chains, not the cumulative total)
//     intervalLive: number,        // setInterval minus clearInterval handles
//     windowListeners: number,     // window.addEventListener minus removeEventListener
//     documentListeners: number,   // document.addEventListener minus removeEventListener
//   }
//
// The rAF wrapper is the subtle one: we replace the user's callback with our
// own that decrements the live count *before* running the user code. The
// browser firing the frame is what invokes our wrapper, so the decrement is
// exactly the "this frame has been consumed" event we couldn't otherwise see.
// If the user's callback calls `requestAnimationFrame` again the schedule
// increments back, keeping the live count pinned at the number of currently-
// pending frames. A healthy app at steady state shows a constant small count
// (R3F's render loop + the FpsCounter's frame sampler = a couple); a teardown
// leak that abandons a pending chain each mount, or that adds a *new* chain
// every mount, shows up as the count drifting upward. The wrappers are shape-
// preserving (same return values, same semantics); they only update running
// tallies, never alter app behaviour.
//
// ── Why this works across full navigations ──────────────────────────────
//
// Each cycle navigates to `about:blank` and back. That destroys the entire
// JS context, so a leaked rAF chain from the previous mount cannot persist
// across the navigation itself — `window` is gone, and with it any pending
// rAF and any registered listener. The instrument script also re-runs on
// every load (`addInitScript` semantics), so each cycle's counters boot at
// zero and measure *only* what that fresh mount registers and fails to clean
// up while the page is alive.
//
// The leak shape the per-cycle counters therefore catch is **steady-state
// non-determinism**: each fresh mount should settle to the *same* live counts
// as every other mount. A regression where, e.g., a `useEffect` adds a window
// listener it then forgets to remove would leave `windowListeners` one higher
// than the steady state — but since the listener is gone the moment
// navigation takes the page away, the regression is observable as: "this
// mount's steady state differs from the baseline mount's". The doc's
// "no duplicate / no additional" criteria become "every cycle's steady state
// matches the baseline". We gate that honestly with a min-watermark baseline
// (see `evaluateMount`).
//
// The **memory** signal (Phase 8's GC-accurate `sampleHeap` / `fitTrend` /
// `evaluateLeak`, reused verbatim) is what catches the kind of leak that
// *can* survive a navigation: browser-level retained resources that the JS
// heap reflects even after the page reloads (a leaked WebGL context keeps
// GPU-backed geometry alive through Chromium's own resource cache). That
// shows up as a sustained upward slope across cycles, exactly like a
// long-session heap leak.
//
// ── Artifacts ───────────────────────────────────────────────────────────
//
// `e2e/.results/mount-metrics.json` accumulates one row per recorded session
// exactly the way Phase 7 / 8 / 9 do, so CI can trend the mount leak shape
// across runs. The writer is flushed at the end of the spec.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page, TestInfo } from '@playwright/test'

export const MOUNT_ARTIFACT = 'e2e/.results/mount-metrics.json'

/** Hard budgets for the mount/unmount stress verdict. These mirror Phase
 *  8's memory budgets directly: a retained-across-navigations leak (the kind
 *  that can actually survive a full page navigation) has the same ceiling
 *  either way. The per-cycle counter shapes are the primary signal; this
 *  budget is the backstop. */
export const MOUNT_BUDGETS = {
	// Total retained growth across all mount/unmount cycles (last − first
	// sample). R3F + the occupancy grid do real per-cycle allocation; ~50MB of
	// headroom leaves room for normal warm-up while still catching a retained
	// browser-resource leak.
	maxGrowthMb: 50,
	// Sustained retained-heap slope, in MB/minute. A leak that retains
	// ~10MB/minute every minute is a real leak — but the per-cycle counter drift
	// (below) is the more immediate signal here.
	maxLeakMbPerMinute: 10,
	// R² floor: only treat a slope as a "leak trend" when the linear fit is
	// reasonably good; below this the series is noise.
	leakTrendR2: 0.6,
} as const

/** A single instrumentation snapshot from `window.__E2E_LEAKS__`. */
export type InstrumentSample = {
	/** Monotonic cycle index (0 = baseline after the first mount settles). */
	i: number
	/** Wall-clock ms since the test started. */
	elapsedMs: number
	/** Currently-pending requestAnimationFrame handles: scheduled minus
	 *  already-fired. The wrapper decrements when the browser fires the
	 *  frame (via its wrapped callback), so this reads as the number of
	 *  *active* rAF chains, not a cumulative total. A healthy R3F app sits at
	 *  a constant low value each mount; a leaked chain drifts it up across
	 *  cycles — exactly the "additional animation loops" pass criterion. */
	rafLive: number | null
	/** Live (scheduled − cleared) setInterval handles. The FpsCounter /
	 *  simulation loop each own intervals; a missing clear grows this. */
	intervalLive: number | null
	/** Live (added − removed) listeners on `window`. */
	windowListeners: number | null
	/** Live (added − removed) listeners on `document`. */
	documentListeners: number | null
}

/** Hard gate threshold for per-cycle counter drift. The baseline is the
 *  **minimum** steady-state reading ever observed (see `evaluateMount`), and
 *  every other cycle's reading must not rise above it by more than this. A
 *  real leak adds at least one handle per cycle, so the lo-water mark climbs
 *  monotonically and exceeds a tolerance of zero well before `cycles` gets
 *  large. */
const COUNTER_DRIFT_TOLERANCE = 0

export type MountStressReport = {
	scenario: string
	/** Number of leave/return cycles performed (excludes the baseline mount). */
	cycles: number
	/** Wall-clock duration of the run in ms. */
	durationMs: number
	/** Per-cycle instrumentation snapshots, in collection order. */
	samples: InstrumentSample[]
	/** Lo-water-mark steady-state readings used as the drift gate. Each
	 *  counter is null when the instrument could not be installed (a missing
	 *  counter is reported, never a false fail). */
	baseline: {
		rafLive: number | null
		intervalLive: number | null
		windowListeners: number | null
		documentListeners: number | null
	}
	/** Maximum rise of any counter above its lo-water-mark baseline across the
	 *  run (max − min). A value > tolerance is the leak signature. */
	maxDrift: {
		rafLive: number | null
		intervalLive: number | null
		windowListeners: number | null
		documentListeners: number | null
	}
	/** Reused Phase 8 memory signals (kept inline here so the report stands
	 *  alone). */
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
 *  `writeMountMetrics()`. */
const reports: MountStressReport[] = []

/** The browser-side instrumentation source. Injected via
 *  `page.addInitScript` so it runs *before* the app bundle — that way every
 *  rAF / interval / listener the app installs during the very first mount is
 *  already counted, establishing an honest cycle-0 baseline. The script is a
 *  string (Playwright ships it verbatim to the page); it must not reference
 *  any module scope.
 *
 *  The rAF wrapper is the careful bit: it replaces the user's callback with a
 *  wrapper of our own. The browser firing the next frame is what invokes our
 *  wrapper, so the decrement inside it *is* the "this handle just fired"
 *  signal — there is no other observable way to see that from outside. After
 *  decrementing we run the user's callback. If it calls
 *  `requestAnimationFrame` again (a self-rescheduling animation loop), the
 *  nested schedule increments the count back, so the live count stays at the
 *  number of currently-pending frames. */
const INSTRUMENT_SCRIPT = `
(() => {
  if (window.__E2E_LEAKS__) return; // idempotent
  let rafLive = 0;
  let intervalLive = 0;
  let windowListeners = 0;
  let documentListeners = 0;

  const origRaf = window.requestAnimationFrame.bind(window);
  const origCancelRaf = window.cancelAnimationFrame.bind(window);
  const origSetInterval = window.setInterval.bind(window);
  const origClearInterval = window.clearInterval.bind(window);
  const origWindowAdd = window.addEventListener.bind(window);
  const origWindowRemove = window.removeEventListener.bind(window);
  const origDocAdd = document.addEventListener.bind(document);
  const origDocRemove = document.removeEventListener.bind(document);

  // Track which ids are currently pending so cancelAnimationFrame only
  // decrements for handles we still count as live (avoids double-decrement
  // if an app cancels an already-fired handle).
  const pendingRaf = new Set();

  window.requestAnimationFrame = function (cb) {
    const wrapped = function (ts) {
      // Frame fired: the handle is no longer pending. Decrement before running
      // the user code so a self-rescheduling loop nets to a constant live
      // count rather than a climbing cumulative one.
      if (pendingRaf.has(id)) {
        pendingRaf.delete(id);
        rafLive -= 1;
      }
      return cb(ts);
    };
    const id = origRaf(wrapped);
    pendingRaf.add(id);
    rafLive += 1;
    return id;
  };
  window.cancelAnimationFrame = function (id) {
    const wasPending = pendingRaf.has(id);
    pendingRaf.delete(id);
    if (wasPending) rafLive -= 1;
    return origCancelRaf(id);
  };
  window.setInterval = function (handler, timeout, ...args) {
    const id = origSetInterval(handler, timeout, ...args);
    intervalLive += 1;
    return id;
  };
  window.clearInterval = function (id) {
    intervalLive -= 1;
    return origClearInterval(id);
  };
  window.addEventListener = function (type, listener, opts) {
    windowListeners += 1;
    return origWindowAdd(type, listener, opts);
  };
  window.removeEventListener = function (type, listener, opts) {
    windowListeners -= 1;
    return origWindowRemove(type, listener, opts);
  };
  document.addEventListener = function (type, listener, opts) {
    documentListeners += 1;
    return origDocAdd(type, listener, opts);
  };
  document.removeEventListener = function (type, listener, opts) {
    documentListeners -= 1;
    return origDocRemove(type, listener, opts);
  };

  window.__E2E_LEAKS__ = {
    snapshot() {
      return {
        rafLive: rafLive,
        intervalLive: intervalLive,
        windowListeners: windowListeners,
        documentListeners: documentListeners,
      };
    },
  };
})();
`

/** Install the rAF / interval / listener instrumentation so that every
 *  primitive the app installs is counted. Idempotent. Call once per page
 *  *before* the first navigation (`addInitScript` re-runs on every navigation
 *  into the same frame context, establishing a fresh zero baseline per load). */
export function installLeakInstrument(page: Page): void {
	void page.addInitScript(INSTRUMENT_SCRIPT)
}

/** Read a single instrumentation snapshot from the page.
 *
 *  Returns null counters (not a throw) when the probe isn't installed, so a
 *  missing counters API degrades to a warning rather than a mid-run abort —
 *  the same gap-aware shape Phase 7 / 8 / 9 use for their measurement APIs. */
export async function sampleInstrument(
	page: Page,
	t0: number,
	i: number,
): Promise<InstrumentSample> {
	const snap = await page
		.evaluate(() => {
			const api = (window as unknown as { __E2E_LEAKS__?: { snapshot: () => unknown } })
				.__E2E_LEAKS__
			if (!api || typeof api.snapshot !== 'function') return null
			return api.snapshot() as {
				rafLive: number
				intervalLive: number
				windowListeners: number
				documentListeners: number
			}
		})
		.catch(() => null)
	if (snap == null) {
		return {
			i,
			elapsedMs: Date.now() - t0,
			rafLive: null,
			intervalLive: null,
			windowListeners: null,
			documentListeners: null,
		}
	}
	return {
		i,
		elapsedMs: Date.now() - t0,
		rafLive: Number.isFinite(snap.rafLive) ? snap.rafLive : null,
		intervalLive: Number.isFinite(snap.intervalLive) ? snap.intervalLive : null,
		windowListeners: Number.isFinite(snap.windowListeners) ? snap.windowListeners : null,
		documentListeners: Number.isFinite(snap.documentListeners) ? snap.documentListeners : null,
	}
}

/** Evaluate the mount/unmount stress verdict from per-cycle instrument samples.
 *
 *  Verdict rules (doc Phase 10 pass criteria):
 *   - "no additional animation loops" → the live rAF count's lo-water mark
 *     (the steady state each healthy mount sits at) is never exceeded across
 *     the run. A leak adding one chain per mount makes the lo-water mark climb
 *     by exactly one each cycle; the max − min drift exceeds the tolerance
 *     immediately and keeps growing with cycles. Using the *minimum* as
 *     baseline (not the first cycle, which may include the initial cold-mount
 *     settle) makes the gate robust to elevated cycle-0 readings: noise can
 *     only push *up*, so a clean steady state has max == min.
 *   - "no duplicate event listeners"   → window / document listener live
 *     counts use the same min-baseline gate. A teardown `removeEventListener`
 *     that removes from the wrong target (or never fires) leaves the live
 *     count higher than the steady baseline, failing the gate.
 *   - interval live count               → same gate. The sim loop and
 *     FpsCounter each own intervals; a missing clear leaves one per mount,
 *     drifting the lo-water mark up.
 *
 *  The memory verdict (passed in by the spec from Phase 8's `evaluateLeak`)
 *  owns the cross-navigation "did anything stay retained at all" signal that
 *  per-cycle counters can't capture (a leaked browser-level resource like an
 *  unreleased WebGL context survives the page reload and grows the heap). The
 *  two verdicts multiply: either alone fails the run.
 */
export function evaluateMount(
	samples: InstrumentSample[],
	memVerdict: { passed: boolean; warnings: string[] } | null,
	mem: { growthMb: number | null; slopeMbPerMin: number; r2: number },
): {
	passed: boolean
	warnings: string[]
	baseline: MountStressReport['baseline']
	maxDrift: MountStressReport['maxDrift']
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

	// Baseline = the lo-water mark (minimum) ever observed for each counter.
	// Reading noise can only push a value *above* the steady state (an extra
	// scheduled rAF pending at the exact snapshot moment, a transient listener
	// mid-registration), so the minimum is the cleanest steady-state proxy and
	// the max − min drift is the leak signature. A normal mount-to-mount
	// variance of ±N therefore never registers false positives; only a
	// monotonic climb (the leak shape) does.
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
	} as MountStressReport['baseline']
	const maxDrift = {
		rafLive: driftOf('rafLive'),
		intervalLive: driftOf('intervalLive'),
		windowListeners: driftOf('windowListeners'),
		documentListeners: driftOf('documentListeners'),
	} as MountStressReport['maxDrift']

	let countersOk = true
	const check = (name: keyof MountStressReport['maxDrift'], val: number | null) => {
		if (val == null) return
		if (val > COUNTER_DRIFT_TOLERANCE) {
			countersOk = false
			warnings.push(
				`${name} drifted +${val} above lo-water baseline across ${samples.length} samples ` +
					`(tolerance ${COUNTER_DRIFT_TOLERANCE}, min ${baseline[name]}) — a teardown leak`,
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

/** Record a mount-stress report and surface it on the Playwright report. */
export function recordMountReport(report: MountStressReport, info: TestInfo): MountStressReport {
	reports.push(report)
	info.attach('mount-metric.json', {
		body: JSON.stringify(report, null, 2),
		contentType: 'application/json',
	})
	const fmt = (v: number | null) => (v != null ? `+${v}` : '?')
	info.annotations.push(
		{
			type: `rafDrift ${fmt(report.maxDrift.rafLive)}`,
			description:
				(report.maxDrift.rafLive ?? 0) > COUNTER_DRIFT_TOLERANCE ? 'FAIL: rAF loops leak' : 'ok',
		},
		{
			type: `intervalDrift ${fmt(report.maxDrift.intervalLive)}`,
			description:
				(report.maxDrift.intervalLive ?? 0) > COUNTER_DRIFT_TOLERANCE
					? 'FAIL: intervals leak'
					: 'ok',
		},
		{
			type: `winListenerDrift ${fmt(report.maxDrift.windowListeners)}`,
			description:
				(report.maxDrift.windowListeners ?? 0) > COUNTER_DRIFT_TOLERANCE
					? 'FAIL: window listeners leak'
					: 'ok',
		},
		{
			type: `docListenerDrift ${fmt(report.maxDrift.documentListeners)}`,
			description:
				(report.maxDrift.documentListeners ?? 0) > COUNTER_DRIFT_TOLERANCE
					? 'FAIL: document listeners leak'
					: 'ok',
		},
		{
			type: `growth ${report.growthMb != null ? report.growthMb.toFixed(1) : '?'}MB`,
			description: report.passed ? 'ok' : 'FAIL: memory growth',
		},
	)
	const _verdict = report.passed ? 'PASS' : 'FAIL'
	for (const w of report.warnings) console.warn(`[mount] ${report.scenario}: ${w}`)

	return report
}

/** Append accumulated reports to the JSON artifact (concurrent-safe, append-first). */
export async function writeMountMetrics(): Promise<void> {
	const target = artifactPath()
	const existing = await readArtifact()
	const merged = [...existing, ...reports]
	await mkdir(dirname(target), { recursive: true })
	await writeFile(target, `${JSON.stringify(merged, null, 2)}\n`)
}

async function readArtifact(): Promise<MountStressReport[]> {
	try {
		const raw = await readFile(artifactPath(), 'utf8')
		return JSON.parse(raw) ?? []
	} catch {
		return []
	}
}

/** Resolve the artifact path absolutely (same trick as metrics.ts /
 *  memory.ts / render-stability.ts). */
function artifactPath(): string {
	const here = dirname(fileURLToPath(import.meta.url))
	return `${here}/${MOUNT_ARTIFACT.replace(/^e2e\//, '')}`
}
