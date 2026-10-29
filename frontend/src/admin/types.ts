/** Platform admin API types (mirror backend/app/schemas/admin.py). Money is a decimal string. */

import type { AppointmentStatus, IsoDateTime } from '@/types/api'

export type AdminStatus = 'trialing' | 'trial_expired' | 'active' | 'past_due' | 'cancelled' | 'expired' | 'suspended'
export type Granularity = 'month' | 'quarter' | 'half_year' | 'year'
export type Basis = 'calendar' | 'fiscal'

export interface AdminLoginOut {
  step: 'totp' | 'setup'
  challenge_token: string
  secret: string | null
  otpauth_uri: string | null
}

export interface AdminUser {
  id: number
  email: string
  full_name: string
  last_login_at: IsoDateTime | null
}

export interface AdminSession {
  access_token: string
  token_type: string
  expires_in: number
  admin: AdminUser
}

export interface Payment {
  id: number
  business_id: number | null
  business_name: string
  source: 'razorpay' | 'manual'
  provider_payment_id: string | null
  amount: string
  currency: string
  paid_at: IsoDateTime
  note: string | null
  created_at: IsoDateTime
}

export interface PaymentPage {
  items: Payment[]
  total: number
  total_amount: string
  page: number
  page_size: number
}

export interface BusinessRow {
  id: number
  name: string
  slug: string
  phone: string
  owner_name: string | null
  owner_email: string | null
  plan: string
  subscription_status: string
  status: AdminStatus
  is_suspended: boolean
  trial_ends_at: IsoDateTime | null
  current_period_end: IsoDateTime | null
  created_at: IsoDateTime
  appointments_count: number
  customers_count: number
  last_booking_at: IsoDateTime | null
  revenue_total: string
}

export interface BusinessPage {
  items: BusinessRow[]
  total: number
  page: number
  page_size: number
}

export interface AdminAppointment {
  id: number
  reference: string | null
  business_id: number
  business_name: string
  business_slug: string
  business_timezone: string
  service_name: string
  customer_name: string
  customer_phone: string
  customer_email: string | null
  start_time: IsoDateTime
  end_time: IsoDateTime
  status: AppointmentStatus
  price: string
  source: string
  notes: string | null
  created_at: IsoDateTime
}

export interface AuditEntry {
  id: number
  admin_email: string
  action: string
  business_id: number | null
  target_type: string | null
  target_id: number | null
  summary: string
  details: Record<string, unknown>
  ip_address: string | null
  created_at: IsoDateTime
}

export interface AuditPage {
  items: AuditEntry[]
  total: number
  page: number
  page_size: number
}

export type StatusCounts = Record<AdminStatus, number>

export interface MonthlySignups {
  month: string
  label: string
  signups: number
  first_payments: number
}

export interface Overview {
  generated_at: IsoDateTime
  timezone: string
  plan_price: string
  businesses_total: number
  businesses_new_this_month: number
  businesses_new_last_month: number
  status_counts: StatusCounts
  paying_businesses: number
  mrr: string
  arr: string
  revenue_this_month: string
  revenue_last_month: string
  revenue_this_quarter: string
  revenue_this_year: string
  revenue_lifetime: string
  trial_conversion_rate: number | null
  bookings_today: number
  bookings_this_month: number
  bookings_total: number
  end_customers_total: number
  signups_by_month: MonthlySignups[]
  recent_businesses: BusinessRow[]
  recent_payments: Payment[]
}

export interface RevenuePeriod {
  key: string
  label: string
  start: string
  end: string
  revenue: string
  payments: number
  paying_businesses: number
  new_paying_businesses: number
  change_pct: number | null
}

export interface RevenueReport {
  granularity: Granularity
  basis: Basis
  timezone: string
  periods: RevenuePeriod[]
  total_revenue: string
  total_payments: number
  average_revenue: string
}

export interface Subscriptions {
  status_counts: StatusCounts
  mrr: string
  trials_ending_soon: BusinessRow[]
  renewals_due: BusinessRow[]
  past_due: BusinessRow[]
  recently_cancelled: BusinessRow[]
}

export interface Owner {
  id: number
  email: string
  full_name: string
  role: string
  is_active: boolean
  created_at: IsoDateTime
  active_sessions: number
}

export interface BusinessStats {
  services: number
  customers: number
  appointments_total: number
  appointments_upcoming: number
  completed: number
  no_shows: number
  cancelled: number
  last_booking_at: IsoDateTime | null
  revenue_total: string
}

export interface BusinessDetail {
  id: number
  name: string
  slug: string
  phone: string
  email: string | null
  address: string | null
  timezone: string
  plan: string
  subscription_status: string
  status: AdminStatus
  is_suspended: boolean
  is_bookable: boolean
  trial_ends_at: IsoDateTime | null
  current_period_end: IsoDateTime | null
  razorpay_subscription_id: string | null
  created_at: IsoDateTime
  owners: Owner[]
  stats: BusinessStats
  recent_appointments: AdminAppointment[]
  payments: Payment[]
  audit: AuditEntry[]
}

export interface BusinessUpdate {
  name?: string
  phone?: string
  email?: string | null
  address?: string | null
  plan?: string
  subscription_status?: string
  trial_ends_at?: IsoDateTime | null
  current_period_end?: IsoDateTime | null
  is_suspended?: boolean
}

export interface ManualPaymentRequest {
  amount: string
  paid_at?: IsoDateTime
  note?: string
}

export interface ViewAs {
  access_token: string
  expires_in: number
  business_name: string
  owner_email: string
}

export interface ResetLink {
  reset_url: string
  expires_minutes: number
}

export interface BusinessListParams {
  q?: string
  status?: AdminStatus
  sort?: 'newest' | 'oldest' | 'name'
  page?: number
  page_size?: number
}

export interface PaymentListParams {
  business_id?: number
  source?: 'razorpay' | 'manual'
  from?: string
  to?: string
  page?: number
  page_size?: number
}

export interface AppointmentSearchParams {
  q?: string
  status?: AppointmentStatus
  business_id?: number
}
