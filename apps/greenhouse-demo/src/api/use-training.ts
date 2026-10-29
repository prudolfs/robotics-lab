import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
	type PolicyDetail,
	type TrainingCatalog,
	type TrainingRequest,
	trainingApi,
	validationScene,
} from './training'

export function useTraining(connected: boolean) {
	const [data, setData] = useState<TrainingCatalog | null>(null)
	const [choice, setChoice] = useState('')
	const [detail, setDetail] = useState<PolicyDetail | null>(null)
	const [busy, setBusy] = useState(false)
	const [message, setMessage] = useState(
		'Train from reviewed demonstrations, then measure full episodes.',
	)
	const [seed, setSeed] = useState<number | null>(null)
	const [index, setIndex] = useState(0)
	const [playing, setPlaying] = useState(false)
	const [generation, setGeneration] = useState(200000)
	const mounted = useRef(false)
	useEffect(() => {
		mounted.current = true
		return () => {
			mounted.current = false
		}
	}, [])
	const active = data?.jobs.find((job) => job.job_id === data.active_job) ?? null
	const latest = active ?? data?.jobs[0] ?? null
	const automatic =
		active?.selected_checkpoint ??
		data?.jobs.find((job) => job.state === 'completed')?.selected_checkpoint ??
		data?.checkpoints[0]?.checkpoint_id ??
		''
	const selectedId = choice || automatic
	const refresh = useCallback(async (signal?: AbortSignal) => {
		const result = await trainingApi.list(signal)
		if (mounted.current && !signal?.aborted) setData(result)
	}, [])
	useEffect(() => {
		if (!connected) return
		const abort = new AbortController()
		let timer: ReturnType<typeof setTimeout> | undefined
		async function poll() {
			try {
				await refresh(abort.signal)
			} catch (error) {
				if (!abort.signal.aborted)
					setMessage(error instanceof Error ? error.message : 'Training status is unavailable.')
			}
			if (!abort.signal.aborted) timer = setTimeout(() => void poll(), 1000)
		}
		void poll()
		return () => {
			abort.abort()
			clearTimeout(timer)
		}
	}, [connected, refresh])
	useEffect(() => {
		setDetail(null)
		setSeed(null)
		setPlaying(false)
		if (!connected || !selectedId) return
		const abort = new AbortController()
		void trainingApi
			.checkpoint(selectedId, abort.signal)
			.then((result) => {
				if (!abort.signal.aborted) setDetail(result)
			})
			.catch((error: Error) => {
				if (!abort.signal.aborted) setMessage(error.message)
			})
		return () => abort.abort()
	}, [selectedId, connected])
	const rollout =
		detail?.evaluation.episodes.find(
			(item) => item.seed === seed && (item.frames?.length ?? 0) > 0,
		) ?? null
	useEffect(() => {
		if (!rollout || !playing) return
		const timer = setInterval(
			() => setIndex((value) => Math.min(value + 1, rollout.frames?.length ?? 0)),
			50,
		)
		return () => clearInterval(timer)
	}, [rollout, playing])
	useEffect(() => {
		if (rollout && index >= (rollout.frames?.length ?? 0)) setPlaying(false)
	}, [rollout, index])
	const scene = useMemo(
		() => (detail && rollout ? validationScene(detail, rollout, index, playing) : null),
		[detail, rollout, index, playing],
	)
	async function run(operation: () => Promise<string>) {
		if (busy) return
		setBusy(true)
		try {
			const result = await operation()
			if (mounted.current) setMessage(result)
			await refresh()
		} catch (error) {
			if (mounted.current)
				setMessage(error instanceof Error ? error.message : 'Training operation failed.')
		} finally {
			if (mounted.current) setBusy(false)
		}
	}
	const closeReplay = useCallback(() => {
		setSeed(null)
		setPlaying(false)
	}, [])
	return {
		data,
		active,
		latest,
		selectedId,
		detail,
		busy,
		message,
		rollout,
		index,
		playing,
		generation,
		scene,
		closeReplay,
		choose: (id: string) => {
			setChoice(id)
			closeReplay()
		},
		start: (body: TrainingRequest) =>
			run(async () => {
				const result = await trainingApi.start(body)
				setChoice('')
				return `Started CPU worker job ${result.job_id.slice(0, 8)}.`
			}),
		cancel: () =>
			run(async () => {
				if (!active) return 'No active training job.'
				await trainingApi.cancel(active.job_id)
				return 'Cancellation requested. Validated checkpoints are retained.'
			}),
		openReplay: (value: number) => {
			setSeed(value)
			setIndex(0)
			setPlaying(false)
			setGeneration((old) => old + 1)
		},
		seek: (value: number) => {
			setIndex(value)
			setPlaying(false)
			setGeneration((old) => old + 1)
		},
		toggleReplay: () => {
			if (rollout && index >= (rollout.frames?.length ?? 0)) {
				setIndex(0)
				setGeneration((old) => old + 1)
			}
			setPlaying((old) => !old)
		},
	}
}

export type TrainingState = ReturnType<typeof useTraining>
