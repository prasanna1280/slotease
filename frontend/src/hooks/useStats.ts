import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { statsService } from '@/services/statsService'

export function useDaySummary(date: string) {
  return useQuery({ queryKey: queryKeys.stats.summary(date), queryFn: () => statsService.summary(date) })
}

export function useMonthStats(month: string) {
  return useQuery({
    queryKey: queryKeys.stats.month(month),
    queryFn: () => statsService.month(month),
    enabled: /^\d{4}-\d{2}$/.test(month),
  })
}
