import { useEffect, useMemo, useRef, useState } from 'react'
import { model, request } from './client'
import type { HttpModels } from './generated/http'
import { recordedScene } from './training'

export type ComparisonDetail = HttpModels['comparison_detail']
const validate = model<ComparisonDetail>('ComparisonDetail')

export function useComparison() {
	const [data, setData] = useState<ComparisonDetail | null>(null)
	const [entry, setEntry] = useState(0)
	const [index, setIndex] = useState(0)
	const [playing, setPlaying] = useState(false)
	const [open, setOpen] = useState(false)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState('')
	const [generation, setGeneration] = useState(400000)
	const pending = useRef<AbortController | null>(null)
	useEffect(() => () => pending.current?.abort(), [])
	const current = data?.entries[entry] ?? null
	useEffect(() => {
		if (!open || !playing || !current) return
		const timer = setInterval(
			() => setIndex((value) => Math.min(value + 1, current.rollout.frames?.length ?? 0)),
			50,
		)
		return () => clearInterval(timer)
	}, [open, playing, current])
	useEffect(() => {
		if (current && index >= (current.rollout.frames?.length ?? 0)) setPlaying(false)
	}, [current, index])
	const scene = useMemo(
		() =>
			data && current && open
				? recordedScene(
						data.template,
						current.rollout,
						index,
						playing,
						0.05,
						current.checkpoint_id ? 'learned_policy' : 'scripted_reference',
					)
				: null,
		[data, current, open, index, playing],
	)
	return {
		data,
		current,
		index,
		playing,
		busy,
		error,
		scene,
		generation,
		async compare(seed: number, checkpoint_ids: string[]) {
			if (pending.current) return
			const abort = new AbortController()
			pending.current = abort
			setBusy(true)
			setError('')
			try {
				const result = await request(
					'/training/compare',
					{
						method: 'POST',
						signal: abort.signal,
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ seed, checkpoint_ids }),
					},
					validate,
				)
				if (abort.signal.aborted) return
				setData(result)
				setEntry(0)
				setIndex(0)
				setPlaying(false)
				setOpen(true)
				setGeneration((value) => value + 1)
			} catch (reason) {
				if (!abort.signal.aborted)
					setError(reason instanceof Error ? reason.message : 'Comparison failed.')
			} finally {
				pending.current = null
				if (!abort.signal.aborted) setBusy(false)
			}
		},
		choose(value: number) {
			setEntry(value)
			setIndex(0)
			setPlaying(false)
			setOpen(true)
			setGeneration((old) => old + 1)
		},
		seek(value: number) {
			setIndex(value)
			setPlaying(false)
			setGeneration((old) => old + 1)
		},
		toggle() {
			if (current && index >= (current.rollout.frames?.length ?? 0)) {
				setIndex(0)
				setGeneration((old) => old + 1)
			}
			setPlaying((old) => !old)
		},
		close() {
			setOpen(false)
			setPlaying(false)
		},
	}
}
export type ComparisonState = ReturnType<typeof useComparison>
