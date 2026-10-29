import { api } from '@/services/api'
import type { BusinessOut, BusinessUpdate } from '@/types/api'

export const businessService = {
  async get(): Promise<BusinessOut> {
    return (await api.get<BusinessOut>('/business')).data
  },

  async update(data: BusinessUpdate): Promise<BusinessOut> {
    return (await api.patch<BusinessOut>('/business', data)).data
  },
}
