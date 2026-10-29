import { useEffect, useMemo } from 'react'
import { useWorkspace } from '../state/workspace'
import { recordedScene as episodeScene } from './demonstrations'
import { recordedScene, validationScene } from './training'

export function usePlayback() {
	const replay = useWorkspace((state) => state.replay)
	const index = useWorkspace((state) => state.frame)
	const playing = useWorkspace((state) => state.playing)
	const generation = useWorkspace((state) => state.viewGeneration)
	useEffect(() => {
		if (!playing || replay.kind === 'live') return
		const dt =
			replay.kind === 'episode'
				? replay.detail.entry.episode.configuration.control_dt
				: replay.kind === 'validation'
					? replay.detail.checkpoint.configuration.control_dt
					: 0.05
		const timer = setInterval(() => useWorkspace.getState().advancePlayback(), dt * 1000)
		return () => clearInterval(timer)
	}, [playing, replay])
	const scene = useMemo(() => {
		if (replay.kind === 'episode') return episodeScene(replay.detail, index, playing)
		if (replay.kind === 'validation') {
			const rollout = replay.detail.evaluation.episodes.find((item) => item.seed === replay.seed)
			return rollout ? validationScene(replay.detail, rollout, index, playing) : null
		}
		if (replay.kind === 'comparison') {
			const entry = replay.detail.entries[replay.entry]
			return entry
				? recordedScene(
						replay.detail.template,
						entry.rollout,
						index,
						playing,
						0.05,
						entry.checkpoint_id ? 'learned_policy' : 'scripted_reference',
					)
				: null
		}
		return null
	}, [replay, index, playing])
	return { replay, index, playing, generation, scene }
}
