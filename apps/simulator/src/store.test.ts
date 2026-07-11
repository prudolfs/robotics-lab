// Right-panel slice tests (docs/hud.md Phase 1 + Phase 3 + Phase 4).
//
// The panel slice is pure UI state: it owns no simulation. These tests lock the
// toggle/switch behaviour, the default state, and the popped-widget drag/drop
// lifecycle (start → drop-to-edge / cancel / remove) including the singleton
// semantics (re-dropping a kind replaces the existing copy at its new edge).
//
// Phase 4 change: dragging a widget no longer touches `panelOpen` — the drop
// zones overlay the viewport beside a live panel. Only `togglePanel` flips
// `panelOpen`. The drag tests below assert `panelOpen` is **untouched**.

import { afterEach, beforeEach, expect, test } from 'vitest'
import {
	type DropEdge,
	isWidgetPopped,
	resolveInitialTheme,
	THEME_STORAGE_KEY,
	useSimulatorStore,
	type WidgetId,
} from '@/store'

beforeEach(() => {
	// Reset the store between tests so each assertion is independent.
	useSimulatorStore.setState({
		panelOpen: true,
		activeTab: 'sensors',
		popped: [],
		draggingWidget: null,
	})
})

afterEach(() => {
	// Strip any globals the theme tests installed so the next test starts clean.
	delete (globalThis as { localStorage?: Storage }).localStorage
	delete (globalThis as { window?: unknown }).window
})

/** Minimal in-memory localStorage shim (the suite runs under node, not jsdom). */
function installLocalStorageMock() {
	const store = new Map<string, string>()
	const mock: Storage = {
		get length() {
			return store.size
		},
		clear: () => store.clear(),
		getItem: (k) => store.get(k) ?? null,
		key: (i) => Array.from(store.keys())[i] ?? null,
		removeItem: (k) => store.delete(k),
		setItem: (k, v) => store.set(k, String(v)),
	}
	Object.defineProperty(globalThis, 'localStorage', {
		value: mock,
		configurable: true,
		writable: true,
	})
	return mock
}

/** Minimal matchMedia mock (opts: the dark query's `.matches` value). */
function installMatchMediaMock(darkMatches: boolean) {
	const matchMedia = (q: string): MediaQueryList =>
		({
			matches: q === '(prefers-color-scheme: dark)' ? darkMatches : !darkMatches,
			media: q,
			onchange: null,
			addEventListener: () => {},
			removeEventListener: () => {},
			addListener: () => {},
			removeListener: () => {},
			dispatchEvent: () => false,
		}) as unknown as MediaQueryList
	Object.defineProperty(globalThis, 'window', {
		value: { matchMedia },
		configurable: true,
		writable: true,
	})
}

test('panel starts open on the sensors tab', () => {
	const s = useSimulatorStore.getState()
	expect(s.panelOpen).toBe(true)
	expect(s.activeTab).toBe('sensors')
})

test('togglePanel flips panelOpen', () => {
	useSimulatorStore.getState().togglePanel()
	expect(useSimulatorStore.getState().panelOpen).toBe(false)
	useSimulatorStore.getState().togglePanel()
	expect(useSimulatorStore.getState().panelOpen).toBe(true)
})

test('setTab switches the active tab', () => {
	useSimulatorStore.getState().setTab('utils')
	expect(useSimulatorStore.getState().activeTab).toBe('utils')
})

test('setTab does not touch panelOpen', () => {
	useSimulatorStore.getState().togglePanel()
	useSimulatorStore.getState().setTab('map')
	expect(useSimulatorStore.getState().panelOpen).toBe(false)
})

/* --------------------------- Popped widgets ----------------------------- */

test('startDragWidget records the dragged kind but does NOT touch panelOpen', () => {
	useSimulatorStore.getState().startDragWidget('sensors.lidar')
	const s = useSimulatorStore.getState()
	expect(s.draggingWidget).toBe('sensors.lidar')
	// Phase 4: the panel stays open during a drag (drop zones overlay it).
	expect(s.panelOpen).toBe(true)
	expect(s.popped).toHaveLength(0)
})

test('startDragWidget does not close an already-closed panel either', () => {
	useSimulatorStore.getState().togglePanel()
	expect(useSimulatorStore.getState().panelOpen).toBe(false)
	useSimulatorStore.getState().startDragWidget('sensors.lidar')
	// The drag is independent of the panel — it stays in whatever state it was.
	expect(useSimulatorStore.getState().panelOpen).toBe(false)
})

test('dropPoppedWidget docks a copy to the chosen edge and clears the drag', () => {
	useSimulatorStore.getState().startDragWidget('sensors.lidar')
	useSimulatorStore.getState().dropPoppedWidget('sensors.lidar', 'right')
	const s = useSimulatorStore.getState()
	expect(s.draggingWidget).toBeNull()
	// Phase 4: drop does NOT force panelOpen (the panel never closed).
	expect(s.panelOpen).toBe(true)
	expect(s.popped).toHaveLength(1)
	expect(s.popped[0].widget).toBe('sensors.lidar')
	expect(s.popped[0].edge).toBe('right')
	expect(isWidgetPopped(s.popped, 'sensors.lidar')).toBe(true)
})

test('cancelDragWidget clears the drag without popping and without touching panelOpen', () => {
	useSimulatorStore.getState().startDragWidget('teleop.controls')
	useSimulatorStore.getState().cancelDragWidget()
	const s = useSimulatorStore.getState()
	expect(s.draggingWidget).toBeNull()
	// Phase 4: cancel does not force panelOpen back (the panel never closed).
	expect(s.panelOpen).toBe(true)
	expect(s.popped).toHaveLength(0)
})

test('dropping a kind twice replaces the existing copy at the new edge (singleton)', () => {
	const store = useSimulatorStore.getState()
	store.startDragWidget('map.minimap')
	store.dropPoppedWidget('map.minimap', 'left')
	store.startDragWidget('map.minimap')
	store.dropPoppedWidget('map.minimap', 'top')
	const popped = useSimulatorStore.getState().popped
	// Still exactly one copy of the kind, now on the new edge.
	expect(popped).toHaveLength(1)
	expect(popped[0].widget).toBe('map.minimap')
	expect(popped[0].edge).toBe('top')
})

test('dropping distinct kinds adds one popped copy each', () => {
	const store = useSimulatorStore.getState()
	store.dropPoppedWidget('nav.navigation', 'top')
	store.dropPoppedWidget('nav.localization', 'bottom')
	const popped = useSimulatorStore.getState().popped
	expect(popped).toHaveLength(2)
})

test('undockWidget moves a popped widget back to the panel (remove from popped)', () => {
	const store = useSimulatorStore.getState()
	store.dropPoppedWidget('nav.navigation', 'right')
	store.dropPoppedWidget('nav.localization', 'left')
	expect(useSimulatorStore.getState().popped).toHaveLength(2)
	useSimulatorStore.getState().undockWidget('nav.navigation')
	const after = useSimulatorStore.getState().popped
	expect(after).toHaveLength(1)
	expect(isWidgetPopped(after, 'nav.navigation')).toBe(false)
	expect(isWidgetPopped(after, 'nav.localization')).toBe(true)
})

test('undockWidget does not force panelOpen (the panel never closed)', () => {
	useSimulatorStore.getState().startDragWidget('nav.navigation')
	useSimulatorStore.getState().dropPoppedWidget('nav.navigation', 'right')
	// Manually close the panel (the only legal way to do so).
	useSimulatorStore.setState({ panelOpen: false })
	useSimulatorStore.getState().undockWidget('nav.navigation')
	// Phase 4: undock moves the widget back to its tab; the panel's own
	// open/closed state is untouched.
	expect(useSimulatorStore.getState().panelOpen).toBe(false)
})

test('undockWidget is a no-op for a kind that is not popped', () => {
	useSimulatorStore.getState().undockWidget('teleop.controls')
	expect(useSimulatorStore.getState().popped).toHaveLength(0)
})

test('every edge can host a widget', () => {
	const edges: DropEdge[] = ['top', 'right', 'bottom', 'left']
	const widgets: WidgetId[] = [
		'sensors.lidar',
		'map.controls',
		'teleop.controls',
		'utils.robotDebug',
	]
	edges.forEach((edge, i) => {
		useSimulatorStore.getState().dropPoppedWidget(widgets[i], edge)
	})
	const popped = useSimulatorStore.getState().popped
	expect(popped.map((p) => p.edge).sort()).toEqual([...edges].sort())
})

test('isWidgetPopped is false for a kind that only exists in the panel', () => {
	expect(isWidgetPopped([], 'sensors.lidar')).toBe(false)
	expect(isWidgetPopped([{ widget: 'teleop.controls', edge: 'right' }], 'sensors.lidar')).toBe(
		false,
	)
})

/* ----------------------------- Theme (Phase 4d) ----------------------------- */

test('toggleTheme flips the theme and persists to localStorage', () => {
	installLocalStorageMock()
	useSimulatorStore.setState({ theme: 'dark' })
	useSimulatorStore.getState().toggleTheme()
	expect(useSimulatorStore.getState().theme).toBe('light')
	expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')

	useSimulatorStore.getState().toggleTheme()
	expect(useSimulatorStore.getState().theme).toBe('dark')
	expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
})

test('setTheme sets the theme and persists to localStorage', () => {
	installLocalStorageMock()
	useSimulatorStore.getState().setTheme('light')
	expect(useSimulatorStore.getState().theme).toBe('light')
	expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')

	useSimulatorStore.getState().setTheme('dark')
	expect(useSimulatorStore.getState().theme).toBe('dark')
	expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
})

test('initial theme falls back to prefers-color-scheme: dark when no stored value', () => {
	installLocalStorageMock()
	installMatchMediaMock(true)
	expect(resolveInitialTheme()).toBe('dark')
})

test('initial theme falls back to prefers-color-scheme: light when no stored value', () => {
	installLocalStorageMock()
	installMatchMediaMock(false)
	expect(resolveInitialTheme()).toBe('light')
})

test('initial theme prefers a stored choice over the OS preference', () => {
	const ls = installLocalStorageMock()
	ls.setItem(THEME_STORAGE_KEY, 'light')
	installMatchMediaMock(true) // OS would prefer dark
	expect(resolveInitialTheme()).toBe('light')
})

test('initial theme falls back to dark when neither localStorage nor window exist', () => {
	// Node test env: neither `localStorage` nor `window` is defined.
	expect(resolveInitialTheme()).toBe('dark')
})
