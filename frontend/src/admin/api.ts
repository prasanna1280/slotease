import axios, { AxiosHeaders, type AxiosError } from 'axios'
import type {
  AdminAppointment,
  AdminLoginOut,
  AdminSession,
  AdminUser,
  AppointmentSearchParams,
  AuditPage,
  Basis,
  BusinessDetail,
  BusinessListParams,
  BusinessPage,
  BusinessUpdate,
  Granularity,
  ManualPaymentRequest,
  Overview,
  Payment,
  PaymentListParams,
  PaymentPage,
  ResetLink,
  RevenueReport,
  Subscriptions,
} from '@/admin/types'
import { API_BASE_URL } from '@/services/api'
import type { AppointmentStatus } from '@/types/api'

/** Fired on `window` when the admin session is rejected (expired or revoked). */
export const ADMIN_LOGOUT_EVENT = 'admin:logout'

const TOKEN_KEY = 'slotease.admin_token'
let memoryToken: string | null = null

/**
 * The admin token lives in sessionStorage: it is per tab and gone when the tab closes, and it never
 * shares storage with the owner app's tokens.
 */
export const adminToken = {
  get(): string | null {
    try {
      return window.sessionStorage.getItem(TOKEN_KEY) ?? memoryToken
    } catch {
      return memoryToken
    }
  },
  set(token: string): void {
    memoryToken = token
    try {
      window.sessionStorage.setItem(TOKEN_KEY, token)
    } catch {
      // Storage blocked: keep it in memory for this page.
    }
  },
  clear(): void {
    memoryToken = null
    try {
      window.sessionStorage.removeItem(TOKEN_KEY)
    } catch {
      // Nothing stored.
    }
  },
}

export const adminApi = axios.create({
  baseURL: `${API_BASE_URL}/admin`,
  timeout: 20_000,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
})

adminApi.interceptors.request.use((config) => {
  const token = adminToken.get()
  if (token) {
    const headers = AxiosHeaders.from(config.headers)
    headers.set('Authorization', `Bearer ${token}`)
    config.headers = headers
  }
  return config
})

adminApi.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const isAuthCall = error.config?.url?.startsWith('/auth/login') || error.config?.url?.startsWith('/auth/verify')
    if (error.response?.status === 401 && !isAuthCall) {
      adminToken.clear()
      window.dispatchEvent(new Event(ADMIN_LOGOUT_EVENT))
    }
    return Promise.reject(error)
  },
)

export const adminService = {
  async login(email: string, password: string): Promise<AdminLoginOut> {
    return (await adminApi.post<AdminLoginOut>('/auth/login', { email, password })).data
  },
  async verify(challengeToken: string, code: string): Promise<AdminSession> {
    return (await adminApi.post<AdminSession>('/auth/verify', { challenge_token: challengeToken, code })).data
  },
  async me(): Promise<AdminUser> {
    return (await adminApi.get<AdminUser>('/auth/me')).data
  },

  async overview(): Promise<Overview> {
    return (await adminApi.get<Overview>('/overview')).data
  },
  async revenue(granularity: Granularity, basis: Basis): Promise<RevenueReport> {
    return (await adminApi.get<RevenueReport>('/reports/revenue', { params: { granularity, basis } })).data
  },
  async subscriptions(): Promise<Subscriptions> {
    return (await adminApi.get<Subscriptions>('/subscriptions')).data
  },

  async businesses(params: BusinessListParams): Promise<BusinessPage> {
    return (await adminApi.get<BusinessPage>('/businesses', { params })).data
  },
  async business(id: number): Promise<BusinessDetail> {
    return (await adminApi.get<BusinessDetail>(`/businesses/${id}`)).data
  },
  async updateBusiness(id: number, data: BusinessUpdate): Promise<BusinessDetail> {
    return (await adminApi.patch<BusinessDetail>(`/businesses/${id}`, data)).data
  },
  async extendTrial(id: number, days: number): Promise<BusinessDetail> {
    return (await adminApi.post<BusinessDetail>(`/businesses/${id}/extend-trial`, { days })).data
  },
  async recordPayment(id: number, data: ManualPaymentRequest): Promise<Payment> {
    return (await adminApi.post<Payment>(`/businesses/${id}/payments`, data)).data
  },
  async resetLink(id: number, userId: number): Promise<ResetLink> {
    return (await adminApi.post<ResetLink>(`/businesses/${id}/users/${userId}/reset-link`)).data
  },
  async signOutOwner(id: number, userId: number): Promise<void> {
    await adminApi.post(`/businesses/${id}/users/${userId}/sign-out`)
  },
  async deleteBusiness(id: number, confirm: string): Promise<void> {
    await adminApi.delete(`/businesses/${id}`, { data: { confirm } })
  },

  async payments(params: PaymentListParams): Promise<PaymentPage> {
    return (await adminApi.get<PaymentPage>('/payments', { params })).data
  },
  async deletePayment(id: number): Promise<void> {
    await adminApi.delete(`/payments/${id}`)
  },

  async appointments(params: AppointmentSearchParams): Promise<AdminAppointment[]> {
    return (await adminApi.get<AdminAppointment[]>('/appointments', { params })).data
  },
  async updateAppointment(id: number, status: AppointmentStatus): Promise<AdminAppointment> {
    return (await adminApi.patch<AdminAppointment>(`/appointments/${id}`, { status })).data
  },

  async audit(params: { page?: number; business_id?: number }): Promise<AuditPage> {
    return (await adminApi.get<AuditPage>('/audit', { params })).data
  },
}
