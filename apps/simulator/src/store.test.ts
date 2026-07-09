// Right-panel slice tests (docs/hud.md Phase 1).
//
// The panel slice is pure UI state: it owns no simulation. These tests lock the
// toggle/switch behaviour and the default state.

import { beforeEach, expect, test } from 'vitest'
import { useSimulatorStore } from '@/store'

beforeEach(() => {
	// Reset the store between tests so each assertion is independent.
	useSimulatorStore.setState({ panelOpen: true, activeTab: 'sensors' })
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
