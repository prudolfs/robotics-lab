export type ChoiceQuestion = {
	type: 'choice'
	instructions: string
	criteria: Record<string, string>
}
export type LayaRequest = { state: string; questions: Record<string, ChoiceQuestion> }
export type LayaAnswer = { choice: string; probabilities: Record<string, number> }
export type LayaResponse = { answers: Record<string, LayaAnswer>; latencyMs: number }
export type LayaTransport = (request: LayaRequest, signal: AbortSignal) => Promise<LayaResponse>

export function validateRequest(request: LayaRequest) {
	if (!request.state.trim() || request.state.length > 8000)
		throw new Error('Invalid Laya observation')
	const questions = Object.values(request.questions)
	if (!questions.length || questions.length > 8) throw new Error('Invalid Laya question count')
	for (const question of questions) {
		if (
			question.type !== 'choice' ||
			!question.instructions.trim() ||
			Object.keys(question.criteria).length < 2 ||
			Object.values(question.criteria).some((value) => !value.trim())
		)
			throw new Error('Invalid Laya choice question')
	}
}

export function parseAnswers(value: unknown, request: LayaRequest): LayaResponse['answers'] {
	if (
		!value ||
		typeof value !== 'object' ||
		!('answers' in value) ||
		!value.answers ||
		typeof value.answers !== 'object'
	)
		throw new Error('Laya response has no answers')
	const answers: LayaResponse['answers'] = {}
	for (const [key, question] of Object.entries(request.questions)) {
		const raw = (value.answers as Record<string, unknown>)[key]
		if (
			!raw ||
			typeof raw !== 'object' ||
			!('choice' in raw) ||
			typeof raw.choice !== 'string' ||
			!Object.hasOwn(question.criteria, raw.choice) ||
			!('probabilities' in raw) ||
			!raw.probabilities ||
			typeof raw.probabilities !== 'object'
		)
			throw new Error(`Invalid Laya answer: ${key}`)
		const probabilities = raw.probabilities as Record<string, number>
		const values = Object.keys(question.criteria).map((option) => probabilities[option])
		if (
			values.some((p) => typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 1) ||
			Math.abs(values.reduce((sum, p) => sum + p, 0) - 1) > 0.02
		)
			throw new Error(`Invalid Laya probabilities: ${key}`)
		answers[key] = { choice: raw.choice, probabilities: { ...probabilities } }
	}
	return answers
}

export function createLayaClient(
	endpoint = '/api/laya/v1/systemone',
	timeoutMs = 2000,
): LayaTransport {
	return async (request, signal) => {
		validateRequest(request)
		const abort = new AbortController()
		const cancel = () => abort.abort(signal.reason)
		if (signal.aborted) cancel()
		signal.addEventListener('abort', cancel, { once: true })
		const timer = setTimeout(() => abort.abort(new Error('Laya request timed out')), timeoutMs)
		const started = performance.now()
		try {
			const response = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ...request, lang: 'en' }),
				signal: abort.signal,
			})
			if (!response.ok) throw new Error(`Laya HTTP ${response.status}`)
			return {
				answers: parseAnswers(await response.json(), request),
				latencyMs: performance.now() - started,
			}
		} finally {
			clearTimeout(timer)
			signal.removeEventListener('abort', cancel)
		}
	}
}
