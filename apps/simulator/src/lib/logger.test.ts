// Logger tests (docs/hud.md Phase 5).
//
// The ring-buffer logger is plain module state (no React, no sim-loop
// ownership), so these tests drive the public non-React surface directly:
// the console patch (idempotent, pass-through), the cap, and `clearLogs`.
// The `useLogger` React hook is exercised by the E2E suite that mounts the
// logs widget; here we keep the suite node-only (no jsdom).
//
// All `console.*` calls go through the `emit` helper below, which is the one
// place `noConsole` is suppressed — we are testing a console wrapper.

import { afterEach, beforeEach, expect, test } from 'vitest'
import {
	_resetLoggerForTests,
	clearLogs,
	getLogs,
	installConsoleCapture,
	type LogLevel,
	subscribe,
} from '@/lib/logger'

// biome-ignore lint/suspicious/noConsole: snapshot originals to restore after each test (logger wraps console)
const originalInfo = console.info
const originalWarn = console.warn
const originalError = console.error

/** Emit a console line, funnelling `noConsole` to a single suppression site. */
function emit(level: LogLevel, ...args: unknown[]): void {
	// biome-ignore lint/suspicious/noConsole: this is a console-capture logger test
	console[level](...args)
}

beforeEach(() => {
	console.info = originalInfo
	console.warn = originalWarn
	console.error = originalError
	_resetLoggerForTests()
})

afterEach(() => {
	console.info = originalInfo
	console.warn = originalWarn
	console.error = originalError
	_resetLoggerForTests()
})

test('installConsoleCapture captures info/warn/error lines into the buffer', () => {
	installConsoleCapture()
	emit('info', 'hello', 'world')
	emit('warn', 'careful')
	emit('error', 'boom')
	const logs = getLogs()
	expect(logs).toHaveLength(3)
	expect(logs[0]).toMatchObject({ level: 'info', text: 'hello world' })
	expect(logs[1]).toMatchObject({ level: 'warn', text: 'careful' })
	expect(logs[2]).toMatchObject({ level: 'error', text: 'boom' })
	expect(new Set(logs.map((l) => l.id))).toHaveLength(3) // unique monotonic ids
})

test('installConsoleCapture is idempotent — re-installing does not double-capture', () => {
	installConsoleCapture()
	installConsoleCapture()
	emit('warn', 'once')
	expect(getLogs()).toHaveLength(1)
})

test('the patched console still passes through to the original handler', () => {
	const calls: string[] = []
	console.warn = (...args: unknown[]) => calls.push(args.join(' '))
	installConsoleCapture()
	emit('warn', 'passthrough')
	expect(calls).toEqual(['passthrough'])
	expect(getLogs()).toHaveLength(1)
})

test('non-string args are stringified (objects via JSON, others via String)', () => {
	installConsoleCapture()
	emit('info', 'count:', 42, { ok: true })
	const logs = getLogs()
	const entry = logs[0]
	expect(entry).toMatchObject({ level: 'info' })
	expect(entry?.text).toBe('count: 42 {"ok":true}')
})

test('the ring buffer caps at MAX_LOGS (200) by dropping the oldest', () => {
	installConsoleCapture()
	for (let i = 0; i < 250; i++) emit('info', `line ${i}`)
	const logs = getLogs()
	expect(logs).toHaveLength(200)
	// The first 50 emitted ("line 0".."line 49") are dropped; the oldest
	// surviving entry is "line 50" and the newest is "line 249".
	expect(logs[0]?.text).toBe('line 50')
	expect(logs[logs.length - 1]?.text).toBe('line 249')
})

test('clearLogs empties the buffer and notifies subscribers', () => {
	installConsoleCapture()
	emit('info', 'first')
	let notified = 0
	const unsubscribe = subscribe(() => {
		notified++
	})
	clearLogs()
	expect(getLogs()).toHaveLength(0)
	expect(notified).toBe(1)
	unsubscribe()
})

test('subscribe is notified on each new capture and can unsubscribe', () => {
	installConsoleCapture()
	let count = 0
	const unsubscribe = subscribe(() => {
		count++
	})
	emit('info', 'a')
	emit('warn', 'b')
	expect(count).toBe(2)
	unsubscribe()
	emit('error', 'c')
	expect(count).toBe(2)
	expect(getLogs()).toHaveLength(3)
})

test('useLogger is a no-op-safe import surface (hook lives in React)', async () => {
	const mod = await import('@/lib/logger')
	expect(typeof mod.useLogger).toBe('function')
})
