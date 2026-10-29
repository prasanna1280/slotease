import { api } from '@/services/api'
import type { CustomerDetailOut, CustomerOut, CustomersQuery, Page } from '@/types/api'

export const customerService = {
  async list(query: CustomersQuery): Promise<Page<CustomerOut>> {
    const params: CustomersQuery = { page: query.page ?? 1, page_size: query.page_size ?? 20 }
    if (query.search?.trim()) params.search = query.search.trim()
    return (await api.get<Page<CustomerOut>>('/customers', { params })).data
  },

  async get(id: number): Promise<CustomerDetailOut> {
    return (await api.get<CustomerDetailOut>(`/customers/${id}`)).data
  },
}
