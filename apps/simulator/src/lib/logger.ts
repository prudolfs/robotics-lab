// Minimal ring-buffer logger (docs/hud.md Phase 5).
//
// A dev-only "System Logs" feed for the Utils tab. `useLogger` captures
// `console.info` / `console.warn` / `console.error` lines into a capped
// ring buffer and returns them through `useSyncExternalStore`, so the logs
// widget re-renders on every new line without touching the simulation loop
// or any Zustand slice. It is intentionally tiny (<60 lines) and owns no sim
// state — the Phase 5 "minimal" option in docs/hud.md.

import { useSyncExternalStore } from 'react'

export type LogLevel = 'info' | 'warn' | 'error'

export interface LogEntry {
	/** Monotonic sequence number (also the React key). */
	id: number
	/** Wall-clock time of the capture (ms since epoch). */
	time: number
	level: LogLevel
	text: string
}

/** Cap the buffer so a chatty session never grows unbounded. */
const MAX_LOGS = 200

let entries: LogEntry[] = []
let seq = 0
const listeners = new Set<() => void>()
let installed = false

function emit(entry: LogEntry) {
	entries = [...entries, entry]
	if (entries.length > MAX_LOGS) entries = entries.slice(entries.length - MAX_LOGS)
	for (const l of listeners) l()
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}

/** Subscribe to buffer changes (returns an unsubscribe fn). Exported for tests. */
export { subscribe }

function getSnapshot(): LogEntry[] {
	return entries
}

function capture(level: LogLevel, args: unknown[]): void {
	const text = args.map((a) => (typeof a === 'string' ? a : safeString(a))).join(' ')
	emit({ id: seq++, time: Date.now(), level, text })
}

function safeString(value: unknown): string {
	try {
		return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)
	} catch {
		return String(value)
	}
}

/**
 * Patch `console.info/warn/error` so subsequent calls are captured into the
 * ring buffer **in addition** to their normal behaviour. Idempotent. No-op
 * when `console` is unavailable (SSR / node test envs). Exported so tests can
 * drive the capture path without React; `useLogger` calls it on first mount.
 */
export function installConsoleCapture(): void {
	if (installed) return
	installed = true
	if (typeof console === 'undefined') return
	for (const level of ['info', 'warn', 'error'] as const) {
		// biome-ignore lint/suspicious/noConsole: this is a console-capture logger — wrapping console is the feature
		const original = console[level].bind(console)
		console[level] = (...args: unknown[]) => {
			capture(level, args)
			original(...args)
		}
	}
}

/** Current snapshot of the ring buffer (for tests / non-React readers). */
export function getLogs(): LogEntry[] {
	return entries
}

/**
 * Test-only reset: clears the buffer, the seq counter, and clears the install
 * guard so `installConsoleCapture` re-patches after `console.*` has been
 * restored to its originals by the test harness. Not used in production.
 */
export function _resetLoggerForTests(): void {
	entries = []
	seq = 0
	installed = false
	listeners.clear()
}

/** Wipe the ring buffer and notify subscribers (the logs widget's "Clear"). */
export function clearLogs(): void {
	entries = []
	for (const l of listeners) l()
}

/**
 * React hook returning the current log entries. Auto-installs the console
 * capture on first call so simply mounting the widget is enough — no wiring
 * needed in `App.tsx` or the simulation loop.
 */
export function useLogger(): LogEntry[] {
	installConsoleCapture()
	return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
