import { api } from '@/services/api'
import type { DaySummaryOut, MonthStatsOut } from '@/types/api'

export const statsService = {
  /** `month` is "YYYY-MM"; defaults to the current local month on the server. */
  async month(month?: string): Promise<MonthStatsOut> {
    return (await api.get<MonthStatsOut>('/stats', { params: month ? { month } : undefined })).data
  },

  async summary(date?: string): Promise<DaySummaryOut> {
    return (await api.get<DaySummaryOut>('/stats/summary', { params: date ? { date } : undefined })).data
  },
}
