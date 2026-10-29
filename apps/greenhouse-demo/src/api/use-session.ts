import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type SessionView } from './client'
import type { ActionData } from './generated/http'
import type { ClientMessage } from './generated/websocket-client'
import { encodeCommand, isCurrentMessage, parseServerMessage } from './protocol'

export type SimulationCommand = Exclude<ClientMessage['kind'], 'ping' | 'manual' | 'set_controller'>

type Connection = {
	status: 'connecting' | 'connected' | 'unavailable' | 'error'
	message: string
	session: SessionView | null
	pending: boolean
}
const initial: Connection = {
	status: 'connecting',
	message: 'Connecting to the greenhouse…',
	session: null,
	pending: false,
}

export function useSession() {
	const [attempt, setAttempt] = useState(0)
	const [state, setState] = useState<Connection>(initial)
	const socketRef = useRef<WebSocket | null>(null)
	const current = useRef<SessionView | null>(null)
	const pending = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null)

	// biome-ignore lint/correctness/useExhaustiveDependencies: attempt explicitly starts a new connection lifecycle.
	useEffect(() => {
		let disposed = false
		let socket: WebSocket | null = null
		let sessionId: string | null = null
		let watchdog: ReturnType<typeof setInterval> | undefined
		const abort = new AbortController()
		const timeout = setTimeout(() => abort.abort(), 4000)
		let lastMessage = Date.now()
		setState(initial)
		current.current = null

		function fail(message: string, status: 'unavailable' | 'error' = 'unavailable') {
			if (disposed) return
			if (pending.current) clearTimeout(pending.current.timer)
			pending.current = null
			setState((previous) => ({ ...previous, status, message, pending: false }))
		}

		async function connect() {
			try {
				const health = await api.health(abort.signal)
				if (health.api_version !== '1')
					throw new Error('The greenhouse server is unavailable or uses an incompatible API.')
				const capabilities = await api.capabilities(abort.signal)
				if (capabilities.mode !== 'reference_simulation')
					throw new Error('The greenhouse server does not support this simulation.')
				const created = await api.createSession({ seed: 42 }, abort.signal)
				sessionId = created.session_id
				if (disposed) {
					void api.deleteSession(sessionId).catch(() => {})
					return
				}
				current.current = created
				const address = new URL(`/api/v1/greenhouse/sessions/${sessionId}/stream`, location.href)
				address.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
				socket = new WebSocket(address)
				socketRef.current = socket
				// The HTTP timeout is replaced by a stream watchdog, including handshake time.
				clearTimeout(timeout)
				lastMessage = Date.now()
				watchdog = setInterval(() => {
					if (Date.now() - lastMessage > 4000) {
						fail('The greenhouse stopped responding. Reconnect to start a fresh session.')
						socket?.close()
					}
				}, 1000)
				socket.onmessage = (event: MessageEvent<string>) => {
					if (disposed) return
					try {
						const message = parseServerMessage(event.data)
						const view = current.current
						if (
							!view ||
							message.session_id !== view.session_id ||
							message.generation < view.generation
						)
							return
						lastMessage = Date.now()
						if (
							message.kind === 'snapshot' &&
							isCurrentMessage(message, view.session_id, view.generation, view.tick)
						) {
							const session: SessionView = {
								api_version: '1',
								session_id: message.session_id,
								generation: message.generation,
								tick: message.tick,
								seed: message.seed,
								scene: message.scene,
								recording: message.recording,
								last_episode_id: message.last_episode_id,
								recording_error: message.recording_error,
								checkpoint_id: message.checkpoint_id,
								controller_error: message.controller_error,
								mission: message.mission,
							}
							current.current = session
							setState((previous) => ({
								...previous,
								session,
								status: 'connected',
								message:
									previous.status === 'connected'
										? previous.message
										: 'Connected to your greenhouse server.',
							}))
						} else if (
							message.kind === 'ack' &&
							pending.current &&
							pending.current.id === message.request_id
						) {
							clearTimeout(pending.current.timer)
							const acknowledged = pending.current
							// Keep state controls disabled through the server's 100 ms
							// command interval; manual renewals use their own bounded lane.
							acknowledged.timer = setTimeout(() => {
								if (pending.current?.id !== acknowledged.id) return
								pending.current = null
								setState((previous) => ({ ...previous, pending: false }))
							}, 110)
							if (message.accepted)
								current.current = {
									...view,
									generation: message.generation,
									tick:
										message.generation > view.generation
											? message.tick
											: Math.max(view.tick, message.tick),
								}
							setState((previous) => ({
								...previous,
								pending: true,
								message: message.accepted
									? {
											start: 'Collection started.',
											pause: 'Collection paused.',
											reset: 'Scenario reset.',
											new_seed: 'New scenario ready.',
											ping: 'Connection confirmed.',
											record: 'Recording demonstration.',
											stop_recording: 'Recording stopped and saved.',
											set_controller: 'Controller selected.',
											manual: 'Manual controls received.',
										}[message.command]
									: `Command rejected: ${message.reason}.`,
							}))
						} else if (message.kind === 'ack' && message.command === 'manual') {
							if (!message.accepted && message.reason !== 'rate_limited')
								setState((previous) => ({
									...previous,
									message: `Manual command rejected: ${message.reason}.`,
								}))
						} else if (message.kind === 'error') {
							fail(message.message, 'error')
							socket?.close()
						}
					} catch {
						fail(
							'The server sent an incompatible message. Reconnect after updating both apps.',
							'error',
						)
						socket?.close()
					}
				}
				socket.onclose = () => {
					if (watchdog) clearInterval(watchdog)
					if (disposed) return
					if (!disposed)
						setState((previous) =>
							previous.status === 'error'
								? previous
								: {
										...previous,
										status: 'unavailable',
										pending: false,
										message: 'Connection closed. Reconnect to start a fresh greenhouse session.',
									},
						)
					if (pending.current) clearTimeout(pending.current.timer)
					pending.current = null
				}
				socket.onerror = () =>
					fail('Cannot reach the greenhouse stream. Check that the Python server is running.')
			} catch (error) {
				clearTimeout(timeout)
				fail(
					error instanceof Error && error.name !== 'AbortError'
						? error.message
						: 'The greenhouse server did not respond. Start it and retry.',
				)
			}
		}
		void connect()
		return () => {
			disposed = true
			abort.abort()
			clearTimeout(timeout)
			if (watchdog) clearInterval(watchdog)
			if (pending.current) clearTimeout(pending.current.timer)
			pending.current = null
			if (socketRef.current === socket) socketRef.current = null
			socket?.close()
			if (sessionId) void api.deleteSession(sessionId).catch(() => {})
		}
	}, [attempt])

	function sendCommand(
		payload:
			| { kind: SimulationCommand }
			| {
					kind: 'set_controller'
					controller: SessionView['scene']['controller']
					checkpoint_id?: string
			  },
	) {
		const view = current.current
		const socket = socketRef.current
		if (!view || socket?.readyState !== WebSocket.OPEN || pending.current) return
		const id = crypto.randomUUID()
		const timer = setTimeout(() => {
			pending.current = null
			setState((previous) => ({
				...previous,
				status: 'unavailable',
				pending: false,
				message: 'The command was not acknowledged. Reconnect and try again.',
			}))
			socket.close()
		}, 4000)
		pending.current = { id, timer }
		setState((previous) => ({ ...previous, pending: true }))
		socket.send(
			encodeCommand({
				api_version: '1',
				...payload,
				request_id: id,
				session_id: view.session_id,
				generation: view.generation,
			}),
		)
	}

	const manual = useCallback((action: ActionData) => {
		const view = current.current
		const socket = socketRef.current
		if (
			!view ||
			pending.current ||
			socket?.readyState !== WebSocket.OPEN ||
			view.scene.controller !== 'manual' ||
			view.scene.status !== 'running'
		)
			return
		socket.send(
			encodeCommand({
				api_version: '1',
				kind: 'manual',
				request_id: crypto.randomUUID(),
				session_id: view.session_id,
				generation: view.generation,
				action,
			}),
		)
	}, [])
	return {
		...state,
		command: (kind: SimulationCommand) => sendCommand({ kind }),
		setController: (controller: SessionView['scene']['controller'], checkpoint_id?: string) =>
			sendCommand({ kind: 'set_controller', controller, checkpoint_id }),
		manual,
		reconnect: () => setAttempt((value) => value + 1),
	}
}
