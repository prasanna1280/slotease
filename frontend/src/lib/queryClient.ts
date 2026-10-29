import { QueryClient } from '@tanstack/react-query'
import { getErrorStatus } from '@/lib/errors'

/** Retry once on network / 5xx failures; never retry client errors (4xx). */
function shouldRetry(failureCount: number, error: unknown): boolean {
  const status = getErrorStatus(error)
  if (status !== undefined && status >= 400 && status < 500) return false
  return failureCount < 1
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: shouldRetry,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

export const queryClient = createQueryClient()
