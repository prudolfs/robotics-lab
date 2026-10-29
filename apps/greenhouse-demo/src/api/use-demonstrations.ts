import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useWorkspace } from '../state/workspace'
import { demonstrations, type Review, recordedScene, type ValidationReport } from './demonstrations'
import { keys } from './query'

export function useDemonstrations(connected: boolean, lastEpisode: string | null | undefined) {
	const client = useQueryClient()
	const replay = useWorkspace((state) => state.replay)
	const index = useWorkspace((state) => state.frame)
	const playing = useWorkspace((state) => state.playing)
	const generation = useWorkspace((state) => state.viewGeneration)
	const selected = replay.kind === 'episode' ? replay.detail : null
	const [message, setMessage] = useState('Demonstrations are stored locally on the Python server.')
	const [validation, setValidation] = useState<ValidationReport | null>(null)
	const query = useQuery({
		queryKey: keys.dataset,
		queryFn: ({ signal }) => demonstrations.list(signal),
		enabled: connected,
	})
	useEffect(() => {
		if (connected && lastEpisode) void client.invalidateQueries({ queryKey: keys.dataset })
	}, [client, connected, lastEpisode])
	const refresh = () => client.invalidateQueries({ queryKey: keys.dataset })
	const operation = useMutation({
		mutationFn: (task: () => Promise<string>) => task(),
		onSuccess: async (text) => {
			setMessage(text)
			await refresh()
		},
		onError: (reason) => setMessage(reason.message),
	})
	const run = (task: () => Promise<string>) => operation.mutateAsync(task).catch(() => {})
	const scene = useMemo(
		() => (selected ? recordedScene(selected, index, playing) : null),
		[selected, index, playing],
	)
	return {
		data: query.data ?? null,
		selected,
		busy: operation.isPending,
		message: query.error?.message ?? message,
		validation,
		index,
		playing,
		generation,
		scene,
		load: (id: string) => {
			const ticket = useWorkspace.getState().beginReplay()
			return run(async () => {
				const detail = await client.fetchQuery({
					queryKey: keys.episode(id),
					queryFn: ({ signal }) => demonstrations.get(id, signal),
				})
				return useWorkspace.getState().finishReplay(ticket, { kind: 'episode', detail })
					? 'Stored-state playback loaded. Live control is disabled while reviewing.'
					: 'Earlier playback request discarded.'
			})
		},
		close: () => {
			if (useWorkspace.getState().replay.kind === 'episode') useWorkspace.getState().returnLive()
			setMessage('Returned to live control.')
		},
		seek: useWorkspace.getState().seek,
		toggle: useWorkspace.getState().togglePlayback,
		refresh: () =>
			run(async () => {
				setValidation(null)
				return 'Demonstration library refreshed.'
			}),
		collect: () =>
			run(async () => {
				setMessage('Collecting 20 scripted expert episodes…')
				const result = await demonstrations.experts()
				client.setQueryData(keys.dataset, result)
				setValidation(null)
				return 'Expert set ready: training seeds 0–19. Existing episodes and reviews were preserved.'
			}),
		review: (review: Review) =>
			run(async () => {
				if (!selected) return ''
				const id = selected.entry.episode.episode_id
				const result = await demonstrations.review(id, review)
				client.setQueryData(keys.episode(id), result)
				useWorkspace.getState().updateEpisode(id, result)
				setValidation(null)
				await client.invalidateQueries({ queryKey: keys.training })
				return 'Review saved separately. The source episode is unchanged.'
			}),
		validate: () =>
			run(async () => {
				const result = await demonstrations.validate()
				setValidation(result)
				return result.ready_for_training
					? `${result.eligible_train_ids.length} reviewed training episodes passed re-simulation and split checks.`
					: 'No training-ready dataset yet. Review the validation result.'
			}),
		import: (file: File) =>
			run(async () => {
				const result = await demonstrations.import(file)
				setValidation(null)
				await client.invalidateQueries({ queryKey: keys.training })
				return `Imported ${result.imported}; ${result.duplicates} identical episodes already existed. Existing reviews were preserved.`
			}),
		download: (id?: string) =>
			run(async () => {
				await demonstrations.download(id)
				return 'Versioned demonstration export downloaded.'
			}),
	}
}
export type DemonstrationLibrary = ReturnType<typeof useDemonstrations>
