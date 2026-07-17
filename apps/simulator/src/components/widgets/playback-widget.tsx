// Playback widget (Playback tab) — milestone 13 (Record & replay simulations).
//
// Hosts all recording / replay controls:
//   - **Record**: start/stop capturing the live simulation into a timeline.
//     Recording is live-loop driven; this widget only flips the store flag.
//   - **Save run / Load run**: serialize the current recording to JSON (and
//     trigger a download) / parse a `.json` file and load it for replay.
//   - **Timeline**: a scrubber spanning the recording's frames. Dragging it
//     seeks the playhead (pauses). While playing the playhead advances.
//   - **Replay**: play / pause / stop + a speed slider. Replay overrides the
//     observed robot pose with the replayed frame's pose so the viewport shows
//     the recorded motion (the loop applies the override).
//
// The widget owns no simulation state; it reads/writes only the UI-facing
// slice crafted in `@/store` (the loop is the authority for capture/playback).
// Like every other widget, its `WidgetCard` drag handle lets the user pop it
// out onto a viewport edge for actual use (the same drag-and-drop affordance
// the camera / minimap widgets use).

import { Disc, Download, Pause, Play, RotateCcw, Square, Upload } from 'lucide-react'
import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { WidgetCard } from '@/components/widgets/widget-card'
import { hasFrames, recordingDuration } from '@/sim/playback'
import { useSimulatorStore } from '@/store'

const fmt = (n: number) => n.toFixed(2)
const fmtTime = (s: number) => {
	if (!Number.isFinite(s)) return '0.00s'
	return `${s.toFixed(2)}s`
}

export function PlaybackWidget() {
	const recording = useSimulatorStore((s) => s.recording)
	const recordingData = useSimulatorStore((s) => s.recordingData)
	const loadedRecording = useSimulatorStore((s) => s.loadedRecording)
	const playback = useSimulatorStore((s) => s.playback)
	const replaying = useSimulatorStore((s) => s.replaying)
	const selectedMap = useSimulatorStore((s) => s.selectedMap)
	const startRecording = useSimulatorStore((s) => s.startRecording)
	const stopRecording = useSimulatorStore((s) => s.stopRecording)
	const clearRecording = useSimulatorStore((s) => s.clearRecording)
	const saveRecording = useSimulatorStore((s) => s.saveRecording)
	const loadRecording = useSimulatorStore((s) => s.loadRecording)
	const playRecording = useSimulatorStore((s) => s.playRecording)
	const pauseRecording = useSimulatorStore((s) => s.pauseRecording)
	const stopReplay = useSimulatorStore((s) => s.stopReplay)
	const seekRecording = useSimulatorStore((s) => s.seekRecording)
	const setPlaybackSpeed = useSimulatorStore((s) => s.setPlaybackSpeed)

	const fileRef = useRef<HTMLInputElement>(null)

	// The recording being reviewed: prefer the loaded (saved) run; fall back to
	// the in-progress / just-finished capture.
	const rec = loadedRecording ?? recordingData
	const frameCount = rec.frames.length
	const duration = recordingDuration(rec)
	const playing = playback.playing
	const index = playback.index
	// Index displayed for the UI: before the first frame shows 0 of N.
	const displayIndex = index < 0 ? 0 : index + 1

	const canRecord = !playing && !replaying
	const canSave = frameCount > 0
	const canLoad = canRecord
	const hasTimeline = hasFrames(rec)

	const onSave = () => {
		const json = saveRecording()
		if (json == null) return
		// Download a JSON file (browser-only; harmless to the sim).
		const blob = new Blob([json], { type: 'application/json' })
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = `recording-${rec.map}-${frameCount}frames.json`
		document.body.appendChild(a)
		a.click()
		a.remove()
		URL.revokeObjectURL(url)
	}

	const onLoadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		if (!file) return
		file
			.text()
			.then((text) => {
				try {
					loadRecording(text)
				} catch (err) {
					console.error('Failed to load recording:', (err as Error).message)
				}
			})
			.finally(() => {
				// Reset so the same file can be picked again later.
				if (fileRef.current) fileRef.current.value = ''
			})
	}

	return (
		<WidgetCard
			title="Playback"
			widget="playback.controls"
			status={
				<span
					className={`font-mono text-xs ${recording ? 'text-red-500' : playing ? 'text-emerald-500' : 'text-muted-foreground'}`}
				>
					{recording ? 'REC' : playing ? 'PLAY' : replaying ? 'PAUSED' : 'IDLE'}
				</span>
			}
			bodyClassName="gap-2"
		>
			{/* Recording controls. */}
			<div className="flex flex-wrap items-center gap-2">
				{recording ? (
					<Button data-testid="record-stop" variant="destructive" size="xs" onClick={stopRecording}>
						<Square className="size-3" /> Stop
					</Button>
				) : (
					<Button
						data-testid="record-start"
						variant="outline"
						size="xs"
						disabled={!canRecord}
						onClick={() => startRecording(selectedMap)}
					>
						<Disc className="size-3" /> Record
					</Button>
				)}
				<Button
					data-testid="record-clear"
					variant="ghost"
					size="xs"
					disabled={recording || (frameCount === 0 && !loadedRecording)}
					onClick={clearRecording}
				>
					Clear
				</Button>
			</div>

			{/* Save / Load run. */}
			<div className="flex flex-wrap items-center gap-2">
				<Button
					data-testid="run-save"
					variant="outline"
					size="xs"
					disabled={!canSave}
					onClick={onSave}
				>
					<Download className="size-3" /> Save run
				</Button>
				<Button
					data-testid="run-load"
					variant="outline"
					size="xs"
					disabled={!canLoad}
					onClick={() => fileRef.current?.click()}
				>
					<Upload className="size-3" /> Load run
				</Button>
				<input
					ref={fileRef}
					type="file"
					accept="application/json,.json"
					onChange={onLoadFile}
					className="hidden"
					data-testid="run-load-input"
				/>
			</div>

			{/* Timeline + replay controls. */}
			<div
				data-testid="playback-timeline"
				className="flex flex-col gap-1 rounded border border-border bg-background/40 p-2"
			>
				<div className="flex items-center justify-between font-mono text-xs">
					<span className="text-muted-foreground">Timeline</span>
					<span data-testid="playback-frame-count">
						{hasTimeline ? `${displayIndex} / ${frameCount}` : '— / —'}
					</span>
				</div>
				<input
					type="range"
					min={0}
					max={Math.max(0, frameCount - 1)}
					value={index < 0 ? 0 : Math.min(index, Math.max(0, frameCount - 1))}
					onChange={(e) => seekRecording(Number(e.target.value))}
					aria-label="Timeline scrubber"
					disabled={!hasTimeline}
					className="h-1 w-full cursor-pointer accent-primary disabled:opacity-40"
					data-testid="playback-scrubber"
				/>
				<div className="flex items-center justify-between font-mono text-[11px] text-muted-foreground">
					<span>t {fmtTime(index < 0 ? 0 : (rec.frames[index]?.time ?? 0))}</span>
					<span>len {fmtTime(duration)}</span>
				</div>
			</div>

			<div className="flex items-center gap-2">
				{playing ? (
					<Button
						data-testid="replay-pause"
						variant="outline"
						size="xs"
						onClick={pauseRecording}
						disabled={!hasTimeline}
					>
						<Pause className="size-3" /> Pause
					</Button>
				) : (
					<Button
						data-testid="replay-play"
						variant="default"
						size="xs"
						onClick={playRecording}
						disabled={!hasTimeline}
					>
						<Play className="size-3" /> Play
					</Button>
				)}
				<Button
					data-testid="replay-stop"
					variant="ghost"
					size="xs"
					onClick={stopReplay}
					disabled={!hasTimeline && !replaying}
					aria-label="Stop replay"
				>
					<RotateCcw className="size-3" /> Stop
				</Button>
				{replaying && (
					<Button variant="destructive" size="xs" onClick={stopReplay}>
						<Square className="size-3" /> Exit
					</Button>
				)}
			</div>

			{/* Playback speed. */}
			<div className="flex flex-col gap-1">
				<span className="text-muted-foreground text-xs">Playback speed</span>
				<div className="flex items-center gap-2">
					<input
						type="range"
						min={0.1}
						max={4}
						step={0.1}
						value={playback.speed}
						onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
						aria-label="Playback speed"
						className="h-1 flex-1 cursor-pointer accent-primary"
						data-testid="playback-speed"
					/>
					<span className="w-12 text-right font-mono text-foreground text-xs">
						{fmt(playback.speed)}×
					</span>
				</div>
			</div>

			<div data-testid="playback-status" className="sr-only" aria-hidden="true">
				{recording ? 'recording' : playing ? 'playing' : replaying ? 'paused' : 'idle'}
			</div>
		</WidgetCard>
	)
}
