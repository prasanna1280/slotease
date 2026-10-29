import { api } from '@/services/api'
import type { ServiceCreate, ServiceOut, ServiceUpdate } from '@/types/api'

/** Owner CRUD for the business's services (the bookable catalogue). */
export const catalogService = {
  async list(includeInactive = false): Promise<ServiceOut[]> {
    return (await api.get<ServiceOut[]>('/services', { params: { include_inactive: includeInactive } })).data
  },

  async create(data: ServiceCreate): Promise<ServiceOut> {
    return (await api.post<ServiceOut>('/services', data)).data
  },

  async update(id: number, data: ServiceUpdate): Promise<ServiceOut> {
    return (await api.patch<ServiceOut>(`/services/${id}`, data)).data
  },

  /** DELETE deactivates (keeps history). */
  async deactivate(id: number): Promise<void> {
    await api.delete(`/services/${id}`)
  },
}
