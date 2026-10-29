import { api } from '@/services/api'
import type { BusinessOut, BusinessUpdate, DeleteBusinessRequest } from '@/types/api'

export const businessService = {
  async get(): Promise<BusinessOut> {
    return (await api.get<BusinessOut>('/business')).data
  },

  async update(data: BusinessUpdate): Promise<BusinessOut> {
    return (await api.patch<BusinessOut>('/business', data)).data
  },

  /** Permanently delete the business and all of its data. */
  async remove(data: DeleteBusinessRequest): Promise<void> {
    await api.delete('/business', { data })
  },
}
