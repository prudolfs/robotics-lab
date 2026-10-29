import { test as base } from '@playwright/test'

export { expect } from '@playwright/test'

// The real service deliberately retains disconnected sessions for 120 seconds.
// Release sessions owned by each test so a long suite respects the 16-session cap.
export const test = base.extend<{ releaseSessions: undefined }>({
	releaseSessions: [
		async ({ page, request }, use) => {
			const sessions = new Set<string>()
			page.on('websocket', (socket) => {
				const id = new URL(socket.url()).pathname.match(/\/sessions\/([^/]+)\/stream$/)?.[1]
				if (id) sessions.add(id)
			})
			await use(undefined)
			for (const id of sessions) await request.delete(`/api/v1/greenhouse/sessions/${id}`)
		},
		{ auto: true },
	],
})
