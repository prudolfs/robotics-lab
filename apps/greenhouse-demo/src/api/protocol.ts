import Ajv from 'ajv/dist/2020'
import clientSchema from '../../../greenhouse-server/contracts/websocket-client.schema.json'
import serverSchema from '../../../greenhouse-server/contracts/websocket-server.schema.json'
import type { ClientMessage } from './generated/websocket-client'
import type { ServerMessage } from './generated/websocket-server'

const ajv = new Ajv({ strict: false, allErrors: true })
const validateServer = ajv.compile<ServerMessage>(serverSchema)
const validateClient = ajv.compile<ClientMessage>(clientSchema)

export function parseServerMessage(text: string): ServerMessage {
	const value: unknown = JSON.parse(text)
	if (!validateServer(value)) throw new Error('The server sent an incompatible greenhouse message.')
	return value
}

export function encodeCommand(command: ClientMessage): string {
	if (!validateClient(command)) throw new Error('The greenhouse command is invalid.')
	return JSON.stringify(command)
}

export function isCurrentMessage(
	message: ServerMessage,
	sessionId: string,
	generation: number,
	tick: number,
): boolean {
	return (
		message.session_id === sessionId &&
		message.generation >= generation &&
		(message.generation > generation || message.tick >= tick)
	)
}
