import { QueryClient } from '@tanstack/react-query'
export const keys = {
	dataset: ['greenhouse', 'dataset'] as const,
	training: ['greenhouse', 'training'] as const,
	missions: ['greenhouse', 'missions'] as const,
	checkpoint: (id: string) => ['greenhouse', 'checkpoint', id] as const,
	episode: (id: string) => ['greenhouse', 'episode', id] as const,
}
export const queryClient = new QueryClient({
	defaultOptions: {
		queries: { retry: false, staleTime: 2000, refetchOnWindowFocus: false, gcTime: 5 * 60 * 1000 },
		mutations: { retry: false },
	},
})
