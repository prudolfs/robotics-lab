import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useWorkspace } from '../state/workspace'
import { keys } from './query'
import { type TrainingRequest, trainingApi, validationScene } from './training'

export function useTraining(connected: boolean) {
	const client = useQueryClient()
	const selectedId = useWorkspace((state) => state.checkpointId)
	const replay = useWorkspace((state) => state.replay)
	const index = useWorkspace((state) => state.frame)
	const playing = useWorkspace((state) => state.playing)
	const generation = useWorkspace((state) => state.viewGeneration)
	const [message, setMessage] = useState(
		'Choose a checkpoint to inspect or train from reviewed demonstrations.',
	)
	const catalog = useQuery({
		queryKey: keys.training,
		queryFn: ({ signal }) => trainingApi.list(signal),
		enabled: connected,
		refetchInterval: (query) => (query.state.data?.active_job ? 1000 : 5000),
	})
	const data = catalog.data ?? null
	useEffect(() => {
		if (data) useWorkspace.getState().reconcileCheckpoints(data)
	}, [data])
	const query = useQuery({
		queryKey: keys.checkpoint(selectedId),
		queryFn: ({ signal }) => trainingApi.checkpoint(selectedId, signal),
		enabled: connected && !!selectedId,
		staleTime: Infinity,
	})
	const detail = query.data ?? null
	const active = data?.jobs.find((job) => job.job_id === data.active_job) ?? null
	const latest = active ?? data?.jobs[0] ?? null
	const operation = useMutation({
		mutationFn: async (body: TrainingRequest | 'cancel') => {
			if (body === 'cancel') {
				if (!active) throw new Error('No active training job.')
				await trainingApi.cancel(active.job_id)
				return 'Cancellation requested. Validated checkpoints are retained.'
			}
			const result = await trainingApi.start(body)
			return `Started CPU worker job ${result.job_id.slice(0, 8)}. Your selected checkpoint stays unchanged.`
		},
		onSuccess: async (text) => {
			setMessage(text)
			await client.invalidateQueries({ queryKey: keys.training })
		},
		onError: (reason) => setMessage(reason.message),
	})
	const validation = replay.kind === 'validation' ? replay : null
	const rollout =
		validation?.detail.evaluation.episodes.find((item) => item.seed === validation.seed) ?? null
	const scene = useMemo(
		() =>
			validation && rollout ? validationScene(validation.detail, rollout, index, playing) : null,
		[validation, rollout, index, playing],
	)
	return {
		data,
		active,
		latest,
		selectedId,
		detail,
		busy: operation.isPending,
		message: query.error?.message ?? catalog.error?.message ?? message,
		rollout,
		index,
		playing,
		generation,
		scene,
		closeReplay: () => {
			if (useWorkspace.getState().replay.kind === 'validation') useWorkspace.getState().returnLive()
		},
		choose: useWorkspace.getState().chooseCheckpoint,
		start: (body: TrainingRequest) => operation.mutateAsync(body).catch(() => {}),
		cancel: () => operation.mutateAsync('cancel').catch(() => {}),
		openReplay: (seed: number) => {
			if (detail?.checkpoint.checkpoint_id === selectedId)
				useWorkspace.getState().showReplay({ kind: 'validation', detail, seed })
		},
		seek: useWorkspace.getState().seek,
		toggleReplay: useWorkspace.getState().togglePlayback,
	}
}
export type TrainingState = ReturnType<typeof useTraining>
