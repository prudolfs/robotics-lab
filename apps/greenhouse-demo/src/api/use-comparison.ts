import { useMutation } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useWorkspace } from '../state/workspace'
import { model, request } from './client'
import type { HttpModels } from './generated/http'
import { recordedScene } from './training'
export type ComparisonDetail = HttpModels['comparison_detail']
const validate = model<ComparisonDetail>('ComparisonDetail')
export function useComparison() {
	const replay = useWorkspace((state) => state.replay)
	const index = useWorkspace((state) => state.frame)
	const playing = useWorkspace((state) => state.playing)
	const generation = useWorkspace((state) => state.viewGeneration)
	const [data, setData] = useState<ComparisonDetail | null>(null)
	const open = replay.kind === 'comparison'
	const detail = open ? replay.detail : data
	const current = detail?.entries[open ? replay.entry : 0] ?? null
	const operation = useMutation({
		mutationFn: async ({
			seed,
			checkpoint_ids,
			ticket,
		}: {
			seed: number
			checkpoint_ids: string[]
			ticket: number
		}) => {
			const result = await request(
				'/training/compare',
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ seed, checkpoint_ids }),
				},
				validate,
			)
			setData(result)
			useWorkspace.getState().finishReplay(ticket, { kind: 'comparison', detail: result, entry: 0 })
		},
	})
	const scene = useMemo(
		() =>
			open && detail && current
				? recordedScene(
						detail.template,
						current.rollout,
						index,
						playing,
						0.05,
						current.checkpoint_id ? 'learned_policy' : 'scripted_reference',
					)
				: null,
		[open, detail, current, index, playing],
	)
	return {
		data: detail,
		current,
		index,
		playing,
		busy: operation.isPending,
		error: operation.error?.message ?? '',
		scene,
		generation,
		compare: (seed: number, checkpoint_ids: string[]) =>
			operation
				.mutateAsync({ seed, checkpoint_ids, ticket: useWorkspace.getState().beginReplay() })
				.catch(() => {}),
		choose: (entry: number) => {
			if (data) useWorkspace.getState().showReplay({ kind: 'comparison', detail: data, entry })
		},
		seek: useWorkspace.getState().seek,
		toggle: useWorkspace.getState().togglePlayback,
		close: () => {
			if (useWorkspace.getState().replay.kind === 'comparison') useWorkspace.getState().returnLive()
		},
	}
}
export type ComparisonState = ReturnType<typeof useComparison>
