import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
	type Dataset,
	demonstrations,
	type EpisodeDetail,
	type Review,
	recordedScene,
	type ValidationReport,
} from './demonstrations'

export function useDemonstrations(connected: boolean, lastEpisode: string | null | undefined) {
	const [data, setData] = useState<Dataset | null>(null)
	const [selected, setSelected] = useState<EpisodeDetail | null>(null)
	const [busy, setBusy] = useState(false)
	const [message, setMessage] = useState('Connect to the server to inspect demonstrations.')
	const [validation, setValidation] = useState<ValidationReport | null>(null)
	const [index, setIndex] = useState(0)
	const [playing, setPlaying] = useState(false)
	const [generation, setGeneration] = useState(100000)
	const mounted = useRef(false)
	useEffect(() => {
		mounted.current = true
		return () => {
			mounted.current = false
		}
	}, [])
	const refresh = useCallback(async (signal?: AbortSignal) => {
		const result = await demonstrations.list(signal)
		if (mounted.current && !signal?.aborted) setData(result)
	}, [])
	// Each saved recording refreshes the library, including automatic terminal saves.
	// biome-ignore lint/correctness/useExhaustiveDependencies: lastEpisode signals a newly persisted artifact.
	useEffect(() => {
		if (!connected) return
		const abort = new AbortController()
		void refresh(abort.signal)
			.then(() => {
				if (!abort.signal.aborted)
					setMessage('Demonstrations are stored locally on the Python server.')
			})
			.catch((error: Error) => {
				if (!abort.signal.aborted) setMessage(error.message)
			})
		return () => abort.abort()
	}, [connected, lastEpisode, refresh])
	async function run(operation: () => Promise<string>) {
		if (busy) return
		setBusy(true)
		try {
			const text = await operation()
			if (mounted.current) setMessage(text)
		} catch (error) {
			if (mounted.current)
				setMessage(error instanceof Error ? error.message : 'The dataset operation failed.')
		} finally {
			if (mounted.current) setBusy(false)
		}
	}
	useEffect(() => {
		if (!selected || !playing) return
		const timer = setInterval(
			() => setIndex((value) => Math.min(value + 1, selected.entry.episode.frames.length)),
			selected.entry.episode.configuration.control_dt * 1000,
		)
		return () => clearInterval(timer)
	}, [selected, playing])
	useEffect(() => {
		if (selected && index >= selected.entry.episode.frames.length) setPlaying(false)
	}, [selected, index])
	const scene = useMemo(
		() => (selected ? recordedScene(selected, index, playing) : null),
		[selected, index, playing],
	)
	return {
		data,
		selected,
		busy,
		message,
		validation,
		index,
		playing,
		generation,
		scene,
		load: (id: string) =>
			run(async () => {
				const result = await demonstrations.get(id)
				setSelected(result)
				setIndex(0)
				setPlaying(false)
				setGeneration((value) => value + 1)
				return 'Stored-state playback loaded. Live control is disabled while reviewing.'
			}),
		close: () => {
			setSelected(null)
			setPlaying(false)
			setMessage('Returned to live control.')
		},
		seek: (value: number) => {
			setPlaying(false)
			setIndex(value)
			setGeneration((number) => number + 1)
		},
		toggle: () => {
			if (selected && index >= selected.entry.episode.frames.length) {
				setIndex(0)
				setGeneration((value) => value + 1)
			}
			setPlaying((value) => !value)
		},
		refresh: () =>
			run(async () => {
				await refresh()
				setValidation(null)
				return 'Demonstration library refreshed.'
			}),
		collect: () =>
			run(async () => {
				setMessage('Collecting 20 scripted expert episodes…')
				const result = await demonstrations.experts()
				setData(result)
				setValidation(null)
				return 'Expert set ready: training seeds 0–19. Existing episodes and reviews were preserved.'
			}),
		review: (review: Review) =>
			run(async () => {
				if (!selected) return ''
				const result = await demonstrations.review(selected.entry.episode.episode_id, review)
				setSelected(result)
				await refresh()
				setValidation(null)
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
				await refresh()
				setValidation(null)
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
