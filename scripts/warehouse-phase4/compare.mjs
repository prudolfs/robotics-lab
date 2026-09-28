import { mkdir, writeFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { createServer } from '../../apps/warehouse-demo/node_modules/vite/dist/node/index.js'

const server = await createServer({
	root: 'apps/warehouse-demo',
	server: { middlewareMode: true, hmr: false },
	appType: 'custom',
})
try {
	const { createController } = await server.ssrLoadModule('/src/sim/controller.ts')
	const { createLayaClient } = await server.ssrLoadModule('/src/sim/laya-client.ts')
	const seeds = (process.env.SEEDS ?? '3,7,42,99,2026,4821').split(',').map(Number)
	const results = []
	for (const seed of seeds) {
		for (const mode of ['predictable', 'laya']) {
			const controller = createController(seed, {
				mode,
				transport: createLayaClient(
					process.env.LAYA_ENDPOINT ?? 'http://127.0.0.1:8000/v1/systemone',
				),
			})
			const started = performance.now()
			controller.start()
			let reported = 0
			while (controller.getSnapshot().status === 'running') {
				controller.step()
				await controller.settle()
				const state = controller.getSnapshot()
				if (mode === 'laya' && state.elapsed >= reported + 30) {
					reported = state.elapsed
					process.stdout.write(
						`${seed} ${mode} ${Math.round(state.elapsed)}s ${controller.getRoute().stage} ${state.delivered} delivered\n`,
					)
				}
				if (state.elapsed > 901) throw new Error('Unbounded run')
			}
			const state = controller.getSnapshot()
			const trace = controller.getDecisionTrace()
			const latencies = trace.map((item) => item.latencyMs).sort((a, b) => a - b)
			const result = {
				seed,
				mode,
				status: state.status,
				delivered: state.delivered,
				incoming: state.scenario.cargo.length,
				elapsed: state.elapsed,
				wallSeconds: (performance.now() - started) / 1000,
				contactCount: state.contactCount,
				invalidActions: state.invalidActions,
				reason: controller.getRoute().failReason,
				requests: controller.getLaya().requests,
				responses: trace.length,
				uncertainResponses: trace.filter((item) => item.heldReason).length,
				staleResponses: trace.filter((item) => !item.applied && !item.heldReason).length,
				medianLatencyMs: latencies[Math.floor(latencies.length * 0.5)] ?? null,
				p95LatencyMs: latencies[Math.floor(latencies.length * 0.95)] ?? null,
				finalRoute: controller.getRoute(),
				finalForklift: state.forklift,
				rejections: controller.getLaya().rejections,
			}
			results.push(result)
			await mkdir('docs/warehouse-demo/phase4', { recursive: true })
			if (mode === 'laya')
				await writeFile(
					`docs/warehouse-demo/phase4/trace-${seed}.json.gz`,
					gzipSync(JSON.stringify(trace)),
				)
			await writeFile(
				'docs/warehouse-demo/phase4/comparison.json',
				`${JSON.stringify({ generatedAt: new Date().toISOString(), pacing: 'Fixed timestep; await each outstanding request between ticks. Latency is real, simulation does not advance while the runner awaits HTTP.', results }, null, 2)}\n`,
			)
			process.stdout.write(`${JSON.stringify(result)}\n`)
		}
	}
} finally {
	await server.close()
}
