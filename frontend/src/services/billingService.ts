import { api } from '@/services/api'
import type { BillingOut, BillingVerifyRequest, SubscribeOut } from '@/types/api'

export const billingService = {
  async get(): Promise<BillingOut> {
    return (await api.get<BillingOut>('/billing')).data
  },

  /** 503 BILLING_NOT_CONFIGURED, 409 ALREADY_SUBSCRIBED. */
  async subscribe(): Promise<SubscribeOut> {
    return (await api.post<SubscribeOut>('/billing/subscribe')).data
  },

  /** 400 INVALID_SIGNATURE. */
  async verify(data: BillingVerifyRequest): Promise<BillingOut> {
    return (await api.post<BillingOut>('/billing/verify', data)).data
  },

  async cancel(): Promise<BillingOut> {
    return (await api.post<BillingOut>('/billing/cancel')).data
  },
}
