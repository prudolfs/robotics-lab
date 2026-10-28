import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { compile } from 'json-schema-to-typescript'

const source = new URL('../../greenhouse-server/contracts/', import.meta.url)
const output = new URL('../src/api/generated/', import.meta.url)
const check = process.argv.includes('--check')
await mkdir(output, { recursive: true })
const header = '/* Generated from greenhouse-server contracts. Run pnpm contracts:greenhouse. */\n'
const http = JSON.parse(await readFile(new URL('http-models.schema.json', source), 'utf8'))
const files = { 'http.ts': await compile(http, 'HttpModels', { bannerComment: header.trim() }) }
for (const [name, type] of [
	['client', 'ClientMessage'],
	['server', 'ServerMessage'],
]) {
	const schema = JSON.parse(
		await readFile(new URL(`websocket-${name}.schema.json`, source), 'utf8'),
	)
	files[`websocket-${name}.ts`] = await compile(schema, type, { bannerComment: header.trim() })
}
for (const [name, content] of Object.entries(files)) {
	const path = new URL(name, output)
	if (check) {
		if ((await readFile(path, 'utf8')) !== content)
			throw new Error(`${name} is stale. Run pnpm contracts:greenhouse.`)
	} else await writeFile(path, content)
}
process.stdout.write(
	check
		? 'Generated TypeScript contracts match.\n'
		: 'Generated HTTP and WebSocket TypeScript contracts.\n',
)
