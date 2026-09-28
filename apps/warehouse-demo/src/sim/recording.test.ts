/// <reference types="node" />
import { expect, test } from 'vitest'
import { createController } from './controller'
import type { LayaRequest, LayaResponse } from './laya-client'

function answer(request: LayaRequest): LayaResponse {
	const choices: Record<string, string> = {
		travel: 'far',
		gear: 'reverse',
		steering: 'straight',
		fork: 'level',
		action: 'none',
	}
	return {
		latencyMs: 80,
		answers: Object.fromEntries(
			Object.entries(request.questions).map(([key, question]) => {
				const choice = choices[key] ?? Object.keys(question.criteria)[0]
				return [
					key,
					{
						choice,
						probabilities: Object.fromEntries(
							Object.keys(question.criteria).map((option) => [option, option === choice ? 1 : 0]),
						),
					},
				]
			}),
		),
	}
}

test('recorded playback reproduces every world pose and event without another model request', async () => {
	let calls = 0
	let disconnected = false
	const controller = createController(42, {
		mode: 'laya',
		transport: async (request) => {
			calls++
			if (disconnected) throw new Error('Disconnected')
			return answer(request)
		},
	})
	controller.start()
	for (let i = 0; i < 160; i++) {
		controller.step()
		await controller.settle()
	}
	const lastCommand = controller.getRecording()?.frames.at(-1)?.command
	controller.pause()
	controller.pause()
	expect(controller.getRecording()?.frames.at(-1)?.command).toEqual(lastCommand)
	expect(controller.getSummary().pauses).toBe(1)
	controller.start()
	disconnected = true
	for (let i = 0; i < 100 && controller.getSnapshot().status === 'running'; i++) {
		controller.step()
		await controller.settle()
	}
	expect(controller.getSummary().outcome).toBe('stalled')
	expect(controller.getSummary().pauses).toBe(2)
	const recording = controller.getRecording()
	if (!recording) throw new Error('Missing recording')
	expect(recording.decisions.some((decision) => decision.responseTick > 0)).toBe(true)
	expect(recording.frames.some((frame) => (frame.command.throttle ?? 0) < 0)).toBe(true)
	const beforeReplay = calls
	controller.replay()
	controller.start()
	for (const frame of recording.frames.slice(1)) {
		controller.step()
		const state = controller.getSnapshot()
		expect(state.forklift).toEqual(frame.state.forklift)
		expect(state.pallets).toEqual(frame.state.pallets)
		expect(state.events).toEqual(frame.state.events)
		expect(state.elapsed).toBe(frame.state.elapsed)
	}
	expect(controller.getPlayback()?.finished).toBe(true)
	expect(calls).toBe(beforeReplay)
	expect(controller.getSummary().pauses).toBe(2)
	controller.reset()
	expect(controller.getPlayback()).toBeNull()
	expect(controller.getSnapshot().seed).toBe(42)
	expect(controller.getSnapshot().tick).toBe(0)
})

test('comparison preserves complete results and starts identical initial scenarios in the other mode', () => {
	const controller = createController(7)
	const initial = controller.getSnapshot().scenario
	controller.start()
	controller.stepTicks(18000)
	expect(controller.getSummary().outcome).toBe('complete')
	const complete = controller.getSummary()
	controller.compare()
	expect(controller.getMode()).toBe('laya')
	expect(controller.getSnapshot().scenario).toEqual(initial)
	expect(controller.getSnapshot().elapsed).toBe(0)
	expect(controller.getHistory()).toContainEqual(complete)
	controller.setMode('predictable')
	expect(controller.getHistory()).toContainEqual(complete)
})

test('switching a partial run records its original mode and counts only real pauses', () => {
	const controller = createController(42)
	controller.pause()
	controller.start()
	controller.start()
	controller.stepTicks(10)
	controller.pause()
	controller.pause()
	expect(controller.getSummary().pauses).toBe(1)
	controller.setMode('laya')
	expect(controller.getHistory()[0]).toMatchObject({
		mode: 'predictable',
		seed: 42,
		outcome: 'interrupted',
		pauses: 1,
	})
	expect(controller.getSummary().pauses).toBe(0)
})

test('restarting and randomizing repeatedly retain bounded review history', () => {
	const controller = createController(42)
	for (let seed = 0; seed < 20; seed++) {
		controller.reset(seed)
		controller.start()
		controller.stepTicks(2)
	}
	controller.randomize()
	expect(controller.getSnapshot().seed).not.toBe(19)
	expect(controller.getHistory().length).toBeLessThanOrEqual(12)
	expect(controller.getRecording()).toBeNull()
})

test('randomization changes truck arrangement and occupied bays together', () => {
	const controller = createController(42)
	for (let index = 0; index < 30; index++) {
		const previous = controller.getSnapshot().scenario
		controller.randomize()
		const next = controller.getSnapshot().scenario
		expect(next.seed).not.toBe(previous.seed)
		expect(next.cargo.map((item) => `${item.id}:${item.cargoId}`)).not.toEqual(
			previous.cargo.map((item) => `${item.id}:${item.cargoId}`),
		)
		expect(next.existing.map((item) => item.bayId).sort()).not.toEqual(
			previous.existing.map((item) => item.bayId).sort(),
		)
	}
})

test('a complete recorded Laya delivery replays the exact trajectory through every pickup and placement', async () => {
	const { readFileSync } = await import('node:fs')
	const { gunzipSync } = await import('node:zlib')
	const trace = JSON.parse(
		gunzipSync(
			readFileSync(
				new URL('../../../../docs/warehouse-demo/phase4/trace-42.json.gz', import.meta.url),
			),
		).toString(),
	) as {
		observation: string
		choices: Record<string, string>
		probabilities: Record<string, Record<string, number>>
		latencyMs: number
	}[]
	let calls = 0
	const controller = createController(42, {
		mode: 'laya',
		now: () => 0,
		transport: async (request) => {
			const decision = trace[calls++]
			if (!decision || decision.observation !== request.state)
				throw new Error('Recorded model fixture diverged')
			return {
				latencyMs: decision.latencyMs,
				answers: Object.fromEntries(
					Object.entries(decision.choices).map(([key, choice]) => [
						key,
						{ choice, probabilities: decision.probabilities[key] },
					]),
				),
			}
		},
	})
	controller.start()
	while (controller.getSnapshot().status === 'running') {
		controller.step()
		await controller.settle()
	}
	expect(controller.getSnapshot().status).toBe('complete')
	expect(controller.getSnapshot().delivered).toBe(4)
	const recording = controller.getRecording()
	if (!recording) throw new Error('Missing complete recording')
	const previousCalls = calls
	controller.replay()
	controller.start()
	let differences = 0
	for (const frame of recording.frames.slice(1)) {
		controller.step()
		const actual = controller.getSnapshot()
		if (
			JSON.stringify([actual.forklift, actual.pallets, actual.events, actual.elapsed]) !==
			JSON.stringify([
				frame.state.forklift,
				frame.state.pallets,
				frame.state.events,
				frame.state.elapsed,
			])
		)
			differences++
	}
	expect(differences).toBe(0)
	expect(controller.getSnapshot().status).toBe('complete')
	expect(controller.getPlayback()?.finished).toBe(true)
	expect(calls).toBe(previousCalls)
})
