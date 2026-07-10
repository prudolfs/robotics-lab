// Right-panel slice tests (docs/hud.md Phase 1 + Phase 3).
//
// The panel slice is pure UI state: it owns no simulation. These tests lock the
// toggle/switch behaviour, the default state, and the popped-widget drag/drop
// lifecycle (start → drop-to-edge / cancel / remove) including the singleton
// semantics (re-dropping a kind replaces the existing copy at its new edge).

import { beforeEach, expect, test } from 'vitest'
import { type DropEdge, isWidgetPopped, useSimulatorStore, type WidgetId } from '@/store'

beforeEach(() => {
	// Reset the store between tests so each assertion is independent.
	useSimulatorStore.setState({
		panelOpen: true,
		activeTab: 'sensors',
		popped: [],
		draggingWidget: null,
	})
})

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

test('startDragWidget closes the panel + records the dragged kind', () => {
	useSimulatorStore.getState().startDragWidget('sensors.lidar')
	const s = useSimulatorStore.getState()
	expect(s.draggingWidget).toBe('sensors.lidar')
	expect(s.panelOpen).toBe(false)
	expect(s.popped).toHaveLength(0)
})

test('dropPoppedWidget docks a copy to the chosen edge + reopens the panel', () => {
	useSimulatorStore.getState().startDragWidget('sensors.lidar')
	useSimulatorStore.getState().dropPoppedWidget('sensors.lidar', 'right')
	const s = useSimulatorStore.getState()
	expect(s.draggingWidget).toBeNull()
	expect(s.panelOpen).toBe(true)
	expect(s.popped).toHaveLength(1)
	expect(s.popped[0].widget).toBe('sensors.lidar')
	expect(s.popped[0].edge).toBe('right')
	expect(isWidgetPopped(s.popped, 'sensors.lidar')).toBe(true)
})

test('cancelDragWidget clears the drag + reopens the panel without popping', () => {
	useSimulatorStore.getState().startDragWidget('teleop.controls')
	useSimulatorStore.getState().cancelDragWidget()
	const s = useSimulatorStore.getState()
	expect(s.draggingWidget).toBeNull()
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

test('undockWidget reopens the panel', () => {
	useSimulatorStore.getState().startDragWidget('nav.navigation')
	useSimulatorStore.getState().dropPoppedWidget('nav.navigation', 'right')
	useSimulatorStore.setState({ panelOpen: false })
	useSimulatorStore.getState().undockWidget('nav.navigation')
	expect(useSimulatorStore.getState().panelOpen).toBe(true)
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
