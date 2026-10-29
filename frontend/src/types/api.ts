/**
 * TypeScript mirrors of the SlotEase API contract (PRPs/slotease-prp.md → "API CONTRACT").
 * Field names are snake_case exactly as the backend sends them.
 * Money values are decimal strings ("450.00"); times are ISO 8601 strings with offset.
 */

/* ------------------------------------------------------------------ */
/* Enums / unions                                                      */
/* ------------------------------------------------------------------ */

export type AppointmentStatus = 'booked' | 'completed' | 'cancelled' | 'no_show'
export const APPOINTMENT_STATUSES: readonly AppointmentStatus[] = ['booked', 'completed', 'cancelled', 'no_show']

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired'
export const SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  'trialing',
  'active',
  'past_due',
  'cancelled',
  'expired',
]

export type Plan = 'trial' | 'pro'
export type UserRole = 'owner' | 'staff'
export type AppointmentSource = 'online' | 'owner'

/** Allowed values for `slot_interval_min`. */
export const SLOT_INTERVALS = [5, 10, 15, 20, 30, 60] as const
export type SlotInterval = (typeof SLOT_INTERVALS)[number]

/** Weekday index used by the API: 0 = Monday … 6 = Sunday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

/** ISO 8601 date-time string with offset, e.g. "2026-10-10T17:30:00+05:30". */
export type IsoDateTime = string
/** Calendar date "YYYY-MM-DD". */
export type IsoDate = string
/** Decimal money string, e.g. "450.00". */
export type Money = string

/* ------------------------------------------------------------------ */
/* Common                                                              */
/* ------------------------------------------------------------------ */

export interface ApiErrorDetail {
  field: string
  message: string
}

/** Every error response: `{"error": "CODE", "message": "...", "details"?: [...]}`. */
export interface ApiErrorBody {
  error: string
  message: string
  details?: ApiErrorDetail[]
}

export interface MessageOut {
  message: string
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface HealthOut {
  status: 'ok' | string
  database?: 'ok' | string
}

/* ------------------------------------------------------------------ */
/* Users / business / auth                                             */
/* ------------------------------------------------------------------ */

export interface UserOut {
  id: number
  email: string
  full_name: string
  role: UserRole
  business_id: number
  created_at: IsoDateTime
}

export interface BusinessOut {
  id: number
  name: string
  slug: string
  phone: string
  email: string | null
  address: string | null
  timezone: string
  currency: string
  slot_interval_min: number
  booking_window_days: number
  min_notice_minutes: number
  plan: Plan
  subscription_status: SubscriptionStatus
  trial_ends_at: IsoDateTime | null
  current_period_end: IsoDateTime | null
  is_bookable: boolean
  created_at: IsoDateTime
}

export interface AuthOut {
  access_token: string
  refresh_token: string
  token_type: 'bearer'
  expires_in: number
  user: UserOut
  business: BusinessOut
}

export interface MeOut {
  user: UserOut
  business: BusinessOut
}

export interface RegisterRequest {
  business_name: string
  slug?: string
  phone: string
  full_name: string
  email: string
  password: string
  timezone?: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface RefreshRequest {
  refresh_token: string
}

export interface LogoutRequest {
  refresh_token: string
}

export interface UpdateMeRequest {
  full_name: string
}

export interface ChangePasswordRequest {
  current_password: string
  new_password: string
}

export interface ForgotPasswordRequest {
  email: string
}

export interface ResetPasswordRequest {
  token: string
  new_password: string
}

export interface BusinessUpdate {
  name?: string
  slug?: string
  phone?: string
  email?: string | null
  address?: string | null
  timezone?: string
  slot_interval_min?: number
  booking_window_days?: number
  min_notice_minutes?: number
}

/* ------------------------------------------------------------------ */
/* Services                                                            */
/* ------------------------------------------------------------------ */

export interface ServiceOut {
  id: number
  name: string
  description: string | null
  duration_min: number
  price: Money
  is_active: boolean
  created_at: IsoDateTime
}

export interface ServiceCreate {
  name: string
  description?: string | null
  duration_min: number
  /** Decimal string or number; serialised by the backend as a string. */
  price: Money | number
  is_active?: boolean
}

export type ServiceUpdate = Partial<ServiceCreate>

/* ------------------------------------------------------------------ */
/* Working hours                                                       */
/* ------------------------------------------------------------------ */

export interface WorkingHoursOut {
  id: number
  weekday: Weekday
  /** "HH:MM" */
  open_time: string
  /** "HH:MM" */
  close_time: string
}

export interface WorkingHoursRange {
  weekday: Weekday
  open_time: string
  close_time: string
}

export interface WorkingHoursUpdate {
  hours: WorkingHoursRange[]
}

/* ------------------------------------------------------------------ */
/* Public booking                                                      */
/* ------------------------------------------------------------------ */

export interface PublicBusinessOut {
  name: string
  slug: string
  phone: string
  address: string | null
  timezone: string
  currency: string
  booking_window_days: number
  is_bookable: boolean
}

export interface PublicServiceOut {
  id: number
  name: string
  description: string | null
  duration_min: number
  price: Money
}

export interface Slot {
  start_time: IsoDateTime
  end_time: IsoDateTime
  /** "10:00" (24-hour local time). */
  label: string
}

export interface SlotsOut {
  date: IsoDate
  timezone: string
  service_id: number
  duration_min: number
  slots: Slot[]
}

export interface SlotsQuery {
  service_id: number
  date: IsoDate
}

/** Body of `POST /public/{slug}/bookings` and `POST /appointments`. */
export interface BookingCreate {
  service_id: number
  start_time: IsoDateTime
  customer_name: string
  customer_phone: string
  customer_email?: string | null
  notes?: string | null
}

export interface BookingConfirmationOut {
  booking_id: string
  service: string
  start_time: IsoDateTime
  end_time: IsoDateTime
  status: AppointmentStatus
  message: string
  business_name: string
  customer_name: string
  price: Money
}

/* ------------------------------------------------------------------ */
/* Appointments                                                        */
/* ------------------------------------------------------------------ */

export interface AppointmentOut {
  id: number
  reference: string | null
  service_id: number
  service_name: string
  duration_min: number
  customer_id: number
  customer_name: string
  customer_phone: string
  customer_email: string | null
  start_time: IsoDateTime
  end_time: IsoDateTime
  status: AppointmentStatus
  price: Money
  notes: string | null
  source: AppointmentSource
  created_at: IsoDateTime
}

export interface AppointmentUpdate {
  status?: AppointmentStatus
  notes?: string | null
}

/** `GET /appointments` accepts either a single `date` or an inclusive `start`/`end` range (≤ 42 days). */
export type AppointmentsQuery =
  | { date: IsoDate; status?: AppointmentStatus }
  | { start: IsoDate; end: IsoDate; status?: AppointmentStatus }

/* ------------------------------------------------------------------ */
/* Customers                                                           */
/* ------------------------------------------------------------------ */

export interface CustomerOut {
  id: number
  name: string
  phone: string
  email: string | null
  total_bookings: number
  completed_visits: number
  no_shows: number
  last_visit: IsoDateTime | null
  created_at: IsoDateTime
}

export interface CustomerDetailOut extends CustomerOut {
  appointments: AppointmentOut[]
}

export interface CustomersQuery {
  search?: string
  page?: number
  page_size?: number
}

/* ------------------------------------------------------------------ */
/* Stats                                                               */
/* ------------------------------------------------------------------ */

export interface DailyStat {
  date: IsoDate
  bookings: number
  completed: number
  no_shows: number
}

export interface TopService {
  service_id: number
  name: string
  bookings: number
  revenue: Money
}

export interface MonthStatsOut {
  /** "YYYY-MM" */
  month: string
  total_bookings: number
  booked: number
  completed: number
  cancelled: number
  no_shows: number
  /** Percentage with one decimal, e.g. 6.1 */
  no_show_rate: number
  revenue_estimate: Money
  busiest_day: string | null
  new_customers: number
  daily: DailyStat[]
  top_services: TopService[]
}

export interface DaySummaryOut {
  date: IsoDate
  /** Excludes cancelled. */
  total: number
  booked: number
  completed: number
  cancelled: number
  no_shows: number
  revenue_estimate: Money
  next_appointment: AppointmentOut | null
}

/* ------------------------------------------------------------------ */
/* Billing                                                             */
/* ------------------------------------------------------------------ */

export interface BillingOut {
  plan: Plan
  subscription_status: SubscriptionStatus
  trial_ends_at: IsoDateTime | null
  current_period_end: IsoDateTime | null
  is_bookable: boolean
  price_inr: number
  billing_configured: boolean
  razorpay_key_id: string | null
  razorpay_subscription_id: string | null
}

export interface SubscribeOut {
  subscription_id: string
  key_id: string
  short_url: string | null
  /** Paise, e.g. 49900. */
  amount: number
  currency: 'INR' | string
  name: string
  email: string
  contact: string
  /** When trial or paid time is left, the first charge happens at this time instead of now. */
  starts_at: IsoDateTime | null
}

export interface BillingVerifyRequest {
  razorpay_payment_id: string
  razorpay_subscription_id: string
  razorpay_signature: string
}

/** Known error codes returned in `ApiErrorBody.error`. */
export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'SLOT_TAKEN'
  | 'BUSINESS_INACTIVE'
  | 'BUSINESS_NOT_FOUND'
  | 'SERVICE_NOT_FOUND'
  | 'INVALID_SLOT'
  | 'EMAIL_TAKEN'
  | 'SLUG_TAKEN'
  | 'SLUG_RESERVED'
  | 'INVALID_CREDENTIALS'
  | 'INVALID_PASSWORD'
  | 'INVALID_TOKEN'
  | 'BILLING_NOT_CONFIGURED'
  | 'ALREADY_SUBSCRIBED'
  | 'INVALID_SIGNATURE'
  | 'PAYMENT_PROVIDER_ERROR'
