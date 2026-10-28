import Ajv, { type ValidateFunction } from 'ajv/dist/2020'
import httpSchema from '../../../greenhouse-server/contracts/http-models.schema.json'
import type { HttpModels } from './generated/http'

export type SessionView = HttpModels['session']
export type Scene = SessionView['scene']
const prefix = '/api/v1/greenhouse'
const ajv = new Ajv({ strict: false })

function model<T>(name: string): ValidateFunction<T> {
	return ajv.compile<T>({ $ref: `#/$defs/${name}`, $defs: httpSchema.$defs })
}
const health = model<HttpModels['health']>('Health')
const capabilities = model<HttpModels['capabilities']>('Capabilities')
const session = model<SessionView>('SessionView')

async function request<T>(
	path: string,
	options: RequestInit,
	validate: ValidateFunction<T>,
): Promise<T> {
	const response = await fetch(`${prefix}${path}`, options)
	if (!response.ok)
		throw new Error(
			`The greenhouse server returned HTTP ${response.status}. Check the server and retry.`,
		)
	const data: unknown = await response.json()
	if (!validate(data)) throw new Error('The greenhouse server sent an incompatible HTTP response.')
	return data
}

export const api = {
	health(signal: AbortSignal) {
		return request('/health', { signal }, health)
	},
	capabilities(signal: AbortSignal) {
		return request('/capabilities', { signal }, capabilities)
	},
	createSession(body: HttpModels['create_session'], signal: AbortSignal) {
		return request(
			'/sessions',
			{
				method: 'POST',
				signal,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			},
			session,
		)
	},
	getSession(id: string, signal: AbortSignal) {
		return request(`/sessions/${encodeURIComponent(id)}`, { signal }, session)
	},
	async deleteSession(id: string) {
		const response = await fetch(`${prefix}/sessions/${encodeURIComponent(id)}`, {
			method: 'DELETE',
		})
		if (!response.ok) throw new Error('The greenhouse session could not be closed.')
	},
}
