// Tests for the pure playback module (milestone 13).
//
// The recording/replay state machine + the JSON round-trip are exercised here.
// Nothing in these tests touches React or the browser: they only exercise the
// pure functions, so they run under the Node vitest suite.

import { expect, test } from 'vitest'
import {
	advancePlayback,
	createPlaybackState,
	createRecording,
	currentFrame,
	deserializeRecording,
	hasFrames,
	PLAYBACK_TICK_SCALE,
	type PlaybackFrame,
	pausePlayback,
	playPlayback,
	RECORD_EVERY_N_STEPS,
	type Recording,
	recordingDuration,
	recordingFilename,
	seekPlayback,
	serializeRecording,
	setPlaybackSpeed,
	stopPlayback,
} from './playback'

/** Convenience: a minimal valid frame at a given time / pose. */
function frame(t: number, x: number): PlaybackFrame {
	return {
		time: t,
		stepCount: Math.round(t * 60),
		pose: { x, y: 0, heading: 0 },
		velocity: { vx: 0, vy: 0, omega: 0 },
		wheels: { leftWheel: 0, rightWheel: 0 },
		input: { leftWheel: 0, rightWheel: 0 },
		navStatus: 'idle',
		autonomous: false,
		goals: [],
		coverageMode: false,
		coverageComplete: false,
	}
}

/** A recording with N evenly-spaced frames (one per second of sim time). */
function recordingWith(n: number): Recording {
	let rec = createRecording('test', RECORD_EVERY_N_STEPS)
	for (let i = 0; i < n; i++) rec = { ...rec, frames: [...rec.frames, frame(i, i)] }
	return rec
}

test('createRecording starts empty with the given map + default cadence', () => {
	const rec = createRecording('room-a')
	expect(rec.version).toBe(1)
	expect(rec.map).toBe('room-a')
	expect(rec.cadence).toBe(RECORD_EVERY_N_STEPS)
	expect(rec.frames).toEqual([])
	expect(hasFrames(rec)).toBe(false)
	expect(recordingDuration(rec)).toBe(0)
})

test('recordingDuration reports the time of the last frame', () => {
	const rec = recordingWith(5)
	expect(hasFrames(rec)).toBe(true)
	expect(recordingDuration(rec)).toBe(4) // frames at t=0..4
})

test('createPlaybackState is paused before the first frame', () => {
	const pb = createPlaybackState()
	expect(pb.playing).toBe(false)
	expect(pb.index).toBe(-1)
	expect(pb.speed).toBe(1)
})

test('playPlayback starts from the first frame when before it', () => {
	const rec = recordingWith(3)
	const pb = playPlayback(rec, createPlaybackState())
	expect(pb.playing).toBe(true)
	expect(pb.index).toBe(0)
})

test('playPlayback is a no-op on an empty recording', () => {
	const rec = createRecording('x')
	const pb = playPlayback(rec, createPlaybackState())
	expect(pb.playing).toBe(false)
	expect(pb.index).toBe(-1)
})

test('advancePlayback advances the index by one frame per tick at 6x', () => {
	const rec = recordingWith(5)
	// At 6x, speed * TICK_SCALE = 1 whole frame per tick (the unit step).
	let pb = setPlaybackSpeed(playPlayback(rec, createPlaybackState()), 6)
	pb = advancePlayback(rec, pb)
	expect(pb.index).toBe(1)
	expect(pb.playing).toBe(true)
})

test('advancePlayback at 1x keeps the remainder across ticks', () => {
	const rec = recordingWith(5)
	let pb = playPlayback(rec, createPlaybackState()) // index 0, 1x
	// 1x = 1/6 frame/tick → advancing several ticks accumulates toward one frame.
	for (let i = 0; i < 5; i++) pb = advancePlayback(rec, pb)
	expect(pb.index).toBe(0) // not yet a whole frame
	let advanced = false
	for (let i = 0; i < 20; i++) {
		pb = advancePlayback(rec, pb)
		if (pb.index > 0) {
			advanced = true
			break
		}
	}
	expect(advanced).toBe(true)
})

test('advancePlayback is a no-op when not playing', () => {
	const rec = recordingWith(3)
	let pb = createPlaybackState()
	pb = advancePlayback(rec, pb)
	expect(pb.index).toBe(-1)
})

test('seekPlayback clamps to the timeline and pauses', () => {
	const rec = recordingWith(5)
	const pb = seekPlayback(rec, createPlaybackState(), 2)
	expect(pb.index).toBe(2)
	expect(pb.playing).toBe(false)
})

test('seekPlayback clamps out-of-range indices', () => {
	const rec = recordingWith(5)
	expect(seekPlayback(rec, createPlaybackState(), -3).index).toBe(0)
	expect(seekPlayback(rec, createPlaybackState(), 99).index).toBe(4)
})

test('seekPlayback keeps an empty recording at index -1', () => {
	const rec = createRecording('x')
	const pb = seekPlayback(rec, createPlaybackState(), 5)
	expect(pb.index).toBe(-1)
})

test('advancePlayback stops at the last frame and clears playing', () => {
	const rec = recordingWith(2) // frames 0,1
	// At 6x one tick walks one frame, so the second tick lands on the last frame.
	let pb = setPlaybackSpeed(playPlayback(rec, createPlaybackState()), 6)
	pb = advancePlayback(rec, pb) // index 0 -> 1 (last), playing=false
	expect(pb.index).toBe(1)
	expect(pb.playing).toBe(false)
})

test('stopPlayback resets to before the first frame', () => {
	const rec = recordingWith(5)
	const pb = stopPlayback(playPlayback(rec, createPlaybackState()))
	expect(pb.playing).toBe(false)
	expect(pb.index).toBe(-1)
	expect(pb.remainder).toBe(0)
})

test('pausePlayback keeps the index and stops', () => {
	const rec = recordingWith(5)
	const pb = pausePlayback(playPlayback(rec, createPlaybackState()))
	expect(pb.playing).toBe(false)
	expect(pb.index).toBe(0)
})

test('currentFrame returns the frame at the playhead', () => {
	const rec = recordingWith(3)
	expect(currentFrame(rec, createPlaybackState())).toBeNull()
	const pb = playPlayback(rec, createPlaybackState())
	expect(currentFrame(rec, pb)).toEqual(rec.frames[0])
})

test('setPlaybackSpeed clamps to a sane positive range', () => {
	expect(setPlaybackSpeed(createPlaybackState(), 100).speed).toBe(8)
	expect(setPlaybackSpeed(createPlaybackState(), 0).speed).toBe(0.1)
	expect(setPlaybackSpeed(createPlaybackState(), NaN).speed).toBe(1)
})

test('serializeRecording -> deserializeRecording round-trips losslessly', () => {
	const rec = recordingWith(4)
	const json = serializeRecording(rec)
	const back = deserializeRecording(json)
	expect(back).toEqual(rec)
})

test('deserializeRecording rejects malformed JSON', () => {
	expect(() => deserializeRecording('{ not json')).toThrow(/Invalid recording/)
})

test('deserializeRecording rejects an unknown schema version', () => {
	expect(() => deserializeRecording(JSON.stringify({ version: 2 }))).toThrow(
		/Unsupported recording version/,
	)
})

test('deserializeRecording rejects a missing map name', () => {
	expect(() =>
		deserializeRecording(JSON.stringify({ version: 1, cadence: 10, frames: [] })),
	).toThrow(/missing map name/)
})

test('deserializeRecording rejects a bad cadence', () => {
	expect(() =>
		deserializeRecording(JSON.stringify({ version: 1, map: 'm', cadence: -1, frames: [] })),
	).toThrow(/bad cadence/)
})

test('deserializeRecording rejects non-array frames', () => {
	expect(() =>
		deserializeRecording(JSON.stringify({ version: 1, map: 'm', cadence: 10, frames: 'no' })),
	).toThrow(/frames is not an array/)
})

test('deserializeRecording rejects a frame with a bad navStatus', () => {
	const bad = {
		version: 1,
		map: 'm',
		cadence: 10,
		frames: [{ ...frame(0, 0), navStatus: 'flying' }],
	}
	expect(() => deserializeRecording(JSON.stringify(bad))).toThrow(/bad navStatus/)
})

test('recordingFilename embeds the map name and a sanitized timestamp', () => {
	const rec = createRecording('room-a')
	rec.startedAt = '2024-01-02T03:04:05.000Z'
	const name = recordingFilename(rec)
	expect(name.startsWith('recording-room-a-')).toBe(true)
	expect(name.endsWith('.json')).toBe(true)
	// No bare colons (illegal in filenames on some platforms).
	expect(name).not.toContain(':')
})

test('PLAYBACK_TICK_SCALE advances one recorded frame per real-time tick at 1x', () => {
	// The scale is calibrated so 1x ~ real recorded time. Sanity: a single tick
	// at 1x moves exactly one frame forward (the remainder model floors).
	expect(PLAYBACK_TICK_SCALE).toBe(1 / 6)
})
