// Playback (milestone 13 — Record & replay simulations).
//
// A pure, framework-independent recording/replay module. It owns a timeline
// of `PlaybackFrame`s captured from the simulation while recording, plus the
// little state machine that scrubs/plays back the timeline. Nothing here
// touches React, Zustand or the browser — the loop hook in
// `use-simulation-loop.ts` is the only bridge.
//
// Design notes:
//   - **Recording** appends one frame per `RECORD_EVERY_N_STEPS` fixed steps
//     while `record()` is called by the loop. Frames capture the *observed*
//     essentials (robot pose / velocity / wheels, commanded input, sim clock,
//     nav status, goal queue, coverage flags). The lidar *scan samples* are
//     deliberately **not** stored — they are bulky and can be recomputed from
//     the replayed pose against the recorded world, so the saved file stays
//     small while the replayed viewport still shows live lidar rays.
//   - **Replay** overrides the observed robot pose with the replayed frame's
//     pose (the sim keeps ticking underneath in a paused-style mode but its
//     own robot is ignored while a recording is being played back). The user
//     can scrub the timeline, play/pause and set a playback speed. At the end
//     of the timeline playback stops and the user can return to live control.
//   - **Save / load** round-trip the `Recording` through JSON, losslessly.

import type { Goal, NavStatus } from '@robotics-lab/navigation'

/** Wheel speeds (m/s) commanded on a fixed step (mirrors `loop.DriveInput`). */
export type PlaybackDriveInput = { leftWheel: number; rightWheel: number }

/** A single sampled frame of the simulation, captured while recording. */
export type PlaybackFrame = {
	/** Simulation clock in seconds at capture. */
	time: number
	/** Fixed-step counter at capture (monotonic). */
	stepCount: number
	/** Robot pose (ground truth) at capture. */
	pose: { x: number; y: number; heading: number }
	/** Robot velocity at capture. */
	velocity: { vx: number; vy: number; omega: number }
	/** Wheel speeds (m/s) commanded at capture. */
	wheels: { leftWheel: number; rightWheel: number }
	/** Drive input applied on the frame's fixed step. */
	input: PlaybackDriveInput
	/** Controller status reported on that step (`'idle'` in manual mode). */
	navStatus: NavStatus
	/** Whether autonomy was on at capture. */
	autonomous: boolean
	/** Goal queue at capture (the true user destinations, oldest first). */
	goals: Goal[]
	/** Whether coverage mode was active at capture. */
	coverageMode: boolean
	/** Whether the coverage run had already completed. */
	coverageComplete: boolean
}

/** The recording: an ordered list of frames + their capture cadence. */
export type Recording = {
	/** Schema version so a future change to `PlaybackFrame` can migrate. */
	version: 1
	/** Source map name (saved with the run so the replay loads its world). */
	map: string
	/** Number of fixed steps between captured frames (controls granularity). */
	cadence: number
	/** Wall-clock ISO timestamp the recording started. */
	startedAt: string
	/** Frames in capture order (oldest first). */
	frames: PlaybackFrame[]
}

/** Replay player state machine. Pure: the loop summons `advancePlayback`
 *  on each tick and `seekPlayback` on a scrub. */
export type PlaybackState = {
	/** Whether the player is currently advancing through the timeline. */
	playing: boolean
	/** Index of the frame currently shown. `-1` means "before the first
	 *  frame" (a paused-at-start state while the timeline has frames). */
	index: number
	/** Playback speed multiplier (1 = real-time relative to recording). */
	speed: number
	/** Sub-frame accumulator so non-integer playback speeds give smooth motion
	 *  across real render frames (the player advances ≤1 frame per tick). */
	remainder: number
}

/** Fixed steps between captured frames. 10 → 6 captures/sec at FIXED_DT=1/60. */
export const RECORD_EVERY_N_STEPS = 10

/** Default playback speed multiplier. */
export const DEFAULT_PLAYBACK_SPEED = 1

/** An empty playback player (paused before the first frame). */
export function createPlaybackState(): PlaybackState {
	return { playing: false, index: -1, speed: DEFAULT_PLAYBACK_SPEED, remainder: 0 }
}

/** Start a fresh, empty recording for the given map + cadence. */
export function createRecording(map: string, cadence: number = RECORD_EVERY_N_STEPS): Recording {
	return {
		version: 1,
		map,
		cadence,
		startedAt: new Date().toISOString(),
		frames: [],
	}
}

/** Whether a recording has at least one captured frame. */
export function hasFrames(rec: Recording): boolean {
	return rec.frames.length > 0
}

/** Duration of a recording in simulated seconds (time of the last frame). */
export function recordingDuration(rec: Recording): number {
	const last = rec.frames[rec.frames.length - 1]
	return last ? last.time : 0
}

/** Append a frame to a recording, returning a new recording (pure). */
export function appendFrame(rec: Recording, frame: PlaybackFrame): Recording {
	return { ...rec, frames: [...rec.frames, frame] }
}

/**
 * Advance the player by one render tick. Each tick consumes `speed * TICK_SCALE`
 * frames of progress. A whole frame advances the `index` by one (clamped to
 * the last frame); the fractional remainder is carried between ticks so a 0.5×
 * speed advances one frame every other tick, and a 2× speed can advance two.
 *
 * `TICK_SCALE` ties the multiplier to real time: at 1× the player walks one
 * frame per `1/TICK_SCALE` ticks, i.e. one recorded frame every 1/6 s — the
 * rate they were captured at (`RECORD_EVERY_N_STEPS` at FIXED_DT=1/60). So 1×
 * = the motion took as long on replay as it did to record.
 */
export const PLAYBACK_TICK_SCALE = 1 / 6

export function advancePlayback(rec: Recording, state: PlaybackState): PlaybackState {
	if (!state.playing) return state
	if (!hasFrames(rec)) return state
	// Add this tick's fractional frame progress to the running remainder.
	const progress = state.speed * PLAYBACK_TICK_SCALE + state.remainder
	const steps = Math.floor(progress)
	if (steps <= 0) return { ...state, remainder: progress }

	// Clamp at the last frame; reaching it ends playback (paused at the end).
	const next = Math.min(state.index + steps, rec.frames.length - 1)
	const playing = next < rec.frames.length - 1
	return {
		...state,
		index: next,
		playing,
		remainder: playing ? progress - steps : 0,
	}
}

/** Seek the player to an absolute frame index. Pauses playback (scrubbing). */
export function seekPlayback(rec: Recording, state: PlaybackState, index: number): PlaybackState {
	if (!hasFrames(rec)) return { ...state, index: -1, playing: false, remainder: 0 }
	const clamped = Math.max(0, Math.min(index, rec.frames.length - 1))
	return { ...state, index: clamped, playing: false, remainder: 0 }
}

/** Start playback from the current index (or the first frame if before it). */
export function playPlayback(rec: Recording, state: PlaybackState): PlaybackState {
	if (!hasFrames(rec)) return { ...state, playing: false }
	const index = state.index < 0 ? 0 : state.index
	return { ...state, playing: true, index }
}

/** Pause playback (leaves the index where it is). */
export function pausePlayback(state: PlaybackState): PlaybackState {
	return { ...state, playing: false }
}

/** Reset the player to before the first frame and stop. */
export function stopPlayback(state: PlaybackState): PlaybackState {
	return { ...state, playing: false, index: -1, remainder: 0 }
}

/** Return the frame the player is currently resting on, or `null`. */
export function currentFrame(rec: Recording, state: PlaybackState): PlaybackFrame | null {
	if (state.index < 0 || state.index >= rec.frames.length) return null
	return rec.frames[state.index] ?? null
}

/** Set the playback speed multiplier (clamped to a sane positive range). */
export function setPlaybackSpeed(state: PlaybackState, speed: number): PlaybackState {
	const clamped = Number.isFinite(speed) ? Math.max(0.1, Math.min(speed, 8)) : 1
	return { ...state, speed: clamped }
}

/** Serialize a recording to a JSON string (for the "Save run" download). */
export function serializeRecording(rec: Recording): string {
	return JSON.stringify(rec, null, 2)
}

/**
 * Parse a JSON string back into a recording. Throws on malformed input or a
 * schema mismatch so the caller (the load-run action) can surface an error.
 * Defensive: validates `version`, `map`, `cadence` and that `frames` is an
 * array of objects with the expected numeric shape.
 */
export function deserializeRecording(json: string): Recording {
	let data: unknown
	try {
		data = JSON.parse(json)
	} catch (e) {
		throw new Error(`Invalid recording file: ${(e as Error).message}`)
	}
	if (!data || typeof data !== 'object') throw new Error('Invalid recording file: not an object')
	const obj = data as Record<string, unknown>
	if (obj.version !== 1) throw new Error(`Unsupported recording version: ${obj.version}`)
	if (typeof obj.map !== 'string') throw new Error('Invalid recording: missing map name')
	if (typeof obj.cadence !== 'number' || obj.cadence <= 0) {
		throw new Error('Invalid recording: bad cadence')
	}
	if (!Array.isArray(obj.frames)) throw new Error('Invalid recording: frames is not an array')
	const frames = obj.frames.map((raw, i) => parseFrame(raw, i))
	return {
		version: 1,
		map: obj.map,
		cadence: obj.cadence,
		startedAt: typeof obj.startedAt === 'string' ? obj.startedAt : new Date(0).toISOString(),
		frames,
	}
}

function num(v: unknown): number {
	if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('bad number')
	return v
}

function parseFrame(raw: unknown, i: number): PlaybackFrame {
	if (!raw || typeof raw !== 'object') throw new Error(`frame ${i}: not an object`)
	const o = raw as Record<string, unknown>
	const pose = o.pose as Record<string, unknown> | undefined
	const velocity = o.velocity as Record<string, unknown> | undefined
	const wheels = o.wheels as Record<string, unknown> | undefined
	const input = o.input as Record<string, unknown> | undefined
	const goals = o.goals as unknown[] | undefined
	if (!pose || !velocity || !wheels || !input || !Array.isArray(goals)) {
		throw new Error(`frame ${i}: missing required field`)
	}
	const navStatus = o.navStatus
	if (
		navStatus !== 'idle' &&
		navStatus !== 'rotating' &&
		navStatus !== 'driving' &&
		navStatus !== 'arrived'
	) {
		throw new Error(`frame ${i}: bad navStatus`)
	}
	return {
		time: num(o.time),
		stepCount: num(o.stepCount),
		pose: { x: num(pose.x), y: num(pose.y), heading: num(pose.heading) },
		velocity: { vx: num(velocity.vx), vy: num(velocity.vy), omega: num(velocity.omega) },
		wheels: { leftWheel: num(wheels.leftWheel), rightWheel: num(wheels.rightWheel) },
		input: { leftWheel: num(input.leftWheel), rightWheel: num(input.rightWheel) },
		navStatus,
		autonomous: Boolean(o.autonomous),
		goals: goals.map((g, j) => {
			if (!g || typeof g !== 'object') throw new Error(`frame ${i} goal ${j}: not an object`)
			const gg = g as Record<string, unknown>
			return { x: num(gg.x), y: num(gg.y) }
		}),
		coverageMode: Boolean(o.coverageMode),
		coverageComplete: Boolean(o.coverageComplete),
	}
}

/** Suggested filename for a "Save run" download. */
export function recordingFilename(rec: Recording): string {
	const stamp = rec.startedAt.replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
	return `recording-${rec.map}-${stamp}.json`
}
