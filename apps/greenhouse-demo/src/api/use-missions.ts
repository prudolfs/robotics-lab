import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useWorkspace } from '../state/workspace'
import { model, request, type SessionView } from './client'
import type { HttpModels } from './generated/http'
import { keys } from './query'

type Catalog = HttpModels['mission_catalog']
type Mission = HttpModels['mission_view']
type Draft = HttpModels['mission_draft']
type Checkpoint = HttpModels['mission_checkpoint']
const catalogModel = model<Catalog>('MissionCatalog')
const missionModel = model<Mission>('MissionView')
const draftModel = model<Draft>('MissionDraft')
const checkpointModel = model<Checkpoint>('GraphCheckpoint')

export function useMissions(connected: boolean, session: SessionView | null) {
	const client = useQueryClient()
	const choice = useWorkspace((state) => state.missionId)
	const setChoice = useWorkspace.getState().chooseMission
	const catalog = useQuery({
		queryKey: keys.missions,
		queryFn: ({ signal }) => request('/missions', { signal }, catalogModel),
		enabled: connected,
		refetchInterval:
			session?.mission?.state === 'running' || session?.mission?.state === 'paused' ? 1000 : 5000,
	})
	const data = catalog.data ?? null
	const [draft, setDraft] = useState<Draft | null>(null)
	const [checkpoint, setCheckpoint] = useState<Checkpoint | null>(null)
	const [busy, setBusy] = useState(false)
	const [message, setMessage] = useState(
		'Choose a structured mission; language planning is optional.',
	)
	const mounted = useRef(false)
	const operation = useRef<AbortController | null>(null)
	useEffect(() => {
		mounted.current = true
		return () => {
			mounted.current = false
			operation.current?.abort()
		}
	}, [])
	const refresh = () => client.invalidateQueries({ queryKey: keys.missions })
	const selected = choice
		? session?.mission?.mission_id === choice
			? session.mission
			: data?.missions.find((item) => item.mission_id === choice)
		: (session?.mission ?? data?.missions[0])
	async function run(task: (signal: AbortSignal) => Promise<string>) {
		if (operation.current) return
		const abort = new AbortController()
		operation.current = abort
		setBusy(true)
		try {
			const text = await task(abort.signal)
			if (mounted.current) setMessage(text)
			await refresh()
		} catch (reason) {
			if (mounted.current && !abort.signal.aborted)
				setMessage(reason instanceof Error ? reason.message : 'Mission operation failed.')
		} finally {
			operation.current = null
			if (mounted.current) setBusy(false)
		}
	}
	return {
		data,
		selected,
		draft,
		checkpoint,
		busy,
		message: catalog.error?.message ?? message,
		choose(id: string) {
			setChoice(id)
			setCheckpoint(null)
		},
		start(
			intent: HttpModels['mission_request']['intent'],
			controller: 'learned_policy' | 'scripted_reference',
			checkpoint_id: string,
		) {
			return run(async (signal) => {
				if (!session) throw new Error('Connect to a live session first.')
				const result = await request(
					'/missions',
					{
						method: 'POST',
						signal,
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							session_id: session.session_id,
							generation: session.generation,
							intent,
							controller,
							checkpoint_id:
								controller === 'learned_policy' && intent?.capsule_count ? checkpoint_id : null,
						}),
					},
					missionModel,
				)
				if (mounted.current) {
					setChoice(result.mission_id)
					setCheckpoint(null)
				}
				return 'Mission started. Outcomes are verified from simulation state.'
			})
		},
		control(action: 'pause' | 'resume' | 'cancel', missionId = selected?.mission_id) {
			return run(async (signal) => {
				if (!missionId || !session) throw new Error('Select a current mission.')
				await request(
					`/missions/${missionId}/control`,
					{
						method: 'POST',
						signal,
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							session_id: session.session_id,
							generation: session.generation,
							action,
						}),
					},
					missionModel,
				)
				return `Mission ${action} accepted.`
			})
		},
		plan(instruction: string) {
			return run(async (signal) => {
				setDraft(null)
				const result = await request(
					'/missions/draft',
					{
						method: 'POST',
						signal,
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ instruction }),
					},
					draftModel,
				)
				if (mounted.current) setDraft(result)
				return result.message ?? 'Review this draft, then start it explicitly.'
			})
		},
		inspect() {
			return run(async (signal) => {
				if (!selected) throw new Error('Select a mission to inspect.')
				const result = await request(
					`/missions/${selected.mission_id}/checkpoint`,
					{ signal },
					checkpointModel,
				)
				if (
					mounted.current &&
					(!useWorkspace.getState().missionId ||
						useWorkspace.getState().missionId === selected.mission_id)
				)
					setCheckpoint(result)
				return 'Persistent graph checkpoint loaded. This does not resume physical actions.'
			})
		},
	}
}
export type MissionState = ReturnType<typeof useMissions>
