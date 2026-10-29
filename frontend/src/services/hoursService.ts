import { api } from '@/services/api'
import type { WorkingHoursOut, WorkingHoursRange } from '@/types/api'

export const hoursService = {
  async list(): Promise<WorkingHoursOut[]> {
    return (await api.get<WorkingHoursOut[]>('/working-hours')).data
  },

  /** Replaces the whole weekly schedule. */
  async replace(hours: WorkingHoursRange[]): Promise<WorkingHoursOut[]> {
    return (await api.put<WorkingHoursOut[]>('/working-hours', { hours })).data
  },
}
