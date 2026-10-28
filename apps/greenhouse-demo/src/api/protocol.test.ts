import { describe, expect, it } from 'vitest'
import { encodeCommand, isCurrentMessage, parseServerMessage } from './protocol'

const snapshot = {
	api_version: '1',
	kind: 'snapshot',
	session_id: 'session-a',
	generation: 2,
	tick: 3,
	seed: 42,
	scene: {
		mode: 'foundation_preview',
		robot: { id: 'caretaker', x: -1, y: 0, heading: 0, holding: false },
		capsule: { id: 'capsule-1', position: { x: 0, y: 0, z: 0.05 } },
		tray: { id: 'collection-tray', position: { x: 1.65, y: 0.65, z: 0.04 } },
	},
}

describe('separate WebSocket contracts', () => {
	it('validates a real snapshot including finite coordinates and required discriminators', () => {
		expect(parseServerMessage(JSON.stringify(snapshot)).kind).toBe('snapshot')
		for (const invalid of [
			{ ...snapshot, api_version: '2' },
			{ ...snapshot, kind: undefined },
			{ ...snapshot, extra: true },
			{ ...snapshot, generation: -1 },
			{ ...snapshot, scene: { ...snapshot.scene, robot: { ...snapshot.scene.robot, x: null } } },
		])
			expect(() => parseServerMessage(JSON.stringify(invalid))).toThrow()
		expect(() => parseServerMessage('invalid JSON')).toThrow()
	})

	it('ignores a previous session, generation or tick while accepting a reset to tick zero', () => {
		const message = parseServerMessage(JSON.stringify(snapshot))
		expect(isCurrentMessage(message, 'another-session', 2, 3)).toBe(false)
		expect(isCurrentMessage(message, 'session-a', 3, 0)).toBe(false)
		expect(isCurrentMessage(message, 'session-a', 2, 4)).toBe(false)
		expect(isCurrentMessage(message, 'session-a', 2, 3)).toBe(true)
		expect(isCurrentMessage({ ...message, generation: 3, tick: 0 }, 'session-a', 2, 30)).toBe(true)
	})

	it('encodes only compatible commands', () => {
		const command = {
			api_version: '1',
			kind: 'reset_preview',
			request_id: 'reset-1',
			session_id: 'session-a',
			generation: 2,
			seed: 42,
		} as const
		expect(JSON.parse(encodeCommand(command))).toEqual(command)
		expect(() => encodeCommand({ ...command, seed: -1 })).toThrow()
	})
})
