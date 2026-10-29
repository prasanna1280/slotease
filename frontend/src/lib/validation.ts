/**
 * Shared zod schemas and helpers that mirror the backend's validation rules
 * (backend/app/services/validators.py) so users see the same messages before submitting.
 */
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { z } from 'zod'
import { getErrorDetails } from '@/lib/errors'

export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 128
export const PHONE_MIN_DIGITS = 7
export const PHONE_MAX_DIGITS = 15
export const SLUG_MAX = 40

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/
const PHONE_SEPARATORS = /[\s\-().]/g

/** Slugs that collide with app routes (backend returns 422 SLUG_RESERVED for these). */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'app',
  'api',
  'admin',
  'login',
  'register',
  'signup',
  'book',
  'booking',
  'dashboard',
  'settings',
  'billing',
  'pricing',
  'help',
  'support',
  'docs',
  'static',
  'assets',
  'health',
  'forgot-password',
  'reset-password',
  'terms',
  'privacy',
  'about',
  'www',
  'mail',
])

/** Mirror of the backend `slugify`: "Glow Salon & Spa!" -> "glow-salon-spa". Empty input gives "". */
export function slugify(text: string, maxLength = SLUG_MAX): string {
  const ascii = text.normalize('NFKD').replace(/[^\x20-\x7e]/g, '')
  let slug = ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
  slug = slug.slice(0, maxLength).replace(/^-+|-+$/g, '')
  if (!slug) return ''
  while (slug.length < 3) slug = slug.endsWith('-') ? `${slug}1` : `${slug}-1`
  return slug
}

/** Digits of a phone number after stripping separators; null if it has other characters. */
export function phoneDigits(value: string): string | null {
  const raw = value.trim().replace(PHONE_SEPARATORS, '')
  const digits = raw.startsWith('+') ? raw.slice(1) : raw
  return /^\d+$/.test(digits) ? digits : null
}

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Enter your email address.')
  .max(255, 'Email is too long.')
  .pipe(z.email('Enter a valid email address.'))

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
  .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters.`)
  .regex(/[A-Za-z]/, 'Include at least one letter.')
  .regex(/\d/, 'Include at least one number.')

export const phoneSchema = z
  .string()
  .trim()
  .min(1, 'Enter a phone number.')
  .max(32, 'Phone number is too long.')
  .refine((v) => phoneDigits(v) !== null, 'Use digits, spaces, dashes, brackets and an optional leading +.')
  .refine((v) => {
    const d = phoneDigits(v)
    return d === null || (d.length >= PHONE_MIN_DIGITS && d.length <= PHONE_MAX_DIGITS)
  }, `Phone number must have ${PHONE_MIN_DIGITS}–${PHONE_MAX_DIGITS} digits.`)

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Choose a booking page address.')
  .refine((v) => v.length >= 3 && v.length <= SLUG_MAX, 'Use 3–40 characters.')
  .refine(
    (v) => v.length < 3 || SLUG_RE.test(v),
    'Use lowercase letters, numbers and dashes; start and end with a letter or number.',
  )
  .refine((v) => !RESERVED_SLUGS.has(v), 'This address is reserved. Please choose another.')

/* ------------------------------------------------------------------ */
/* Auth form schemas                                                   */
/* ------------------------------------------------------------------ */

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.').max(PASSWORD_MAX, 'Password is too long.'),
})
export type LoginValues = z.infer<typeof loginSchema>

export const registerSchema = z.object({
  business_name: z
    .string()
    .trim()
    .min(2, 'Business name must be at least 2 characters.')
    .max(120, 'Business name must be at most 120 characters.'),
  slug: slugSchema,
  full_name: z.string().trim().min(1, 'Enter your full name.').max(120, 'Name is too long.'),
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
  timezone: z.string().min(1, 'Choose a timezone.'),
})
export type RegisterValues = z.infer<typeof registerSchema>

export const forgotPasswordSchema = z.object({ email: emailSchema })
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirm: z.string().min(1, 'Confirm your new password.'),
  })
  .refine((v) => v.password === v.confirm, { message: 'Passwords do not match.', path: ['confirm'] })
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>

/* ------------------------------------------------------------------ */
/* Timezones                                                           */
/* ------------------------------------------------------------------ */

export interface TimezoneOption {
  value: string
  label: string
}

/** Common IANA zones offered at sign-up (business timezone can be changed later in Settings). */
export const TIMEZONE_OPTIONS: readonly TimezoneOption[] = [
  { value: 'Asia/Kolkata', label: 'India — Asia/Kolkata' },
  { value: 'Asia/Dubai', label: 'UAE — Asia/Dubai' },
  { value: 'Asia/Riyadh', label: 'Saudi Arabia — Asia/Riyadh' },
  { value: 'Asia/Qatar', label: 'Qatar — Asia/Qatar' },
  { value: 'Asia/Karachi', label: 'Pakistan — Asia/Karachi' },
  { value: 'Asia/Colombo', label: 'Sri Lanka — Asia/Colombo' },
  { value: 'Asia/Kathmandu', label: 'Nepal — Asia/Kathmandu' },
  { value: 'Asia/Dhaka', label: 'Bangladesh — Asia/Dhaka' },
  { value: 'Asia/Bangkok', label: 'Thailand — Asia/Bangkok' },
  { value: 'Asia/Jakarta', label: 'Indonesia (West) — Asia/Jakarta' },
  { value: 'Asia/Singapore', label: 'Singapore — Asia/Singapore' },
  { value: 'Asia/Kuala_Lumpur', label: 'Malaysia — Asia/Kuala_Lumpur' },
  { value: 'Asia/Manila', label: 'Philippines — Asia/Manila' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong — Asia/Hong_Kong' },
  { value: 'Asia/Tokyo', label: 'Japan — Asia/Tokyo' },
  { value: 'Australia/Sydney', label: 'Australia (East) — Australia/Sydney' },
  { value: 'Pacific/Auckland', label: 'New Zealand — Pacific/Auckland' },
  { value: 'Africa/Nairobi', label: 'Kenya — Africa/Nairobi' },
  { value: 'Africa/Lagos', label: 'Nigeria — Africa/Lagos' },
  { value: 'Africa/Johannesburg', label: 'South Africa — Africa/Johannesburg' },
  { value: 'Europe/London', label: 'United Kingdom — Europe/London' },
  { value: 'Europe/Paris', label: 'France — Europe/Paris' },
  { value: 'Europe/Berlin', label: 'Germany — Europe/Berlin' },
  { value: 'Europe/Madrid', label: 'Spain — Europe/Madrid' },
  { value: 'America/New_York', label: 'US Eastern — America/New_York' },
  { value: 'America/Chicago', label: 'US Central — America/Chicago' },
  { value: 'America/Denver', label: 'US Mountain — America/Denver' },
  { value: 'America/Los_Angeles', label: 'US Pacific — America/Los_Angeles' },
  { value: 'America/Toronto', label: 'Canada (Eastern) — America/Toronto' },
  { value: 'America/Sao_Paulo', label: 'Brazil — America/Sao_Paulo' },
  { value: 'UTC', label: 'UTC' },
]

export const DEFAULT_TIMEZONE = 'Asia/Kolkata'

/** Browser timezone if it is one of the offered options, else Asia/Kolkata. */
export function defaultTimezone(browserTz: string | undefined): string {
  if (browserTz && TIMEZONE_OPTIONS.some((o) => o.value === browserTz)) return browserTz
  return DEFAULT_TIMEZONE
}

/* ------------------------------------------------------------------ */
/* Server error mapping                                                */
/* ------------------------------------------------------------------ */

/**
 * Copy 422 `details[]` (`{field: "body.email", message}`) onto react-hook-form fields.
 * `fieldMap` renames API fields to form fields (e.g. `{ new_password: 'password' }`).
 * Returns true if at least one field error was set.
 */
export function applyServerFieldErrors<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
  fieldMap: Readonly<Record<string, Path<T>>> = {},
): boolean {
  let applied = false
  for (const detail of getErrorDetails(err)) {
    const apiField = detail.field.replace(/^body\./, '').split('.')[0] ?? ''
    const target = fieldMap[apiField] ?? (fields.includes(apiField as Path<T>) ? (apiField as Path<T>) : undefined)
    if (target) {
      setError(target, { type: 'server', message: detail.message.replace(/^Value error, /, '') }, { shouldFocus: !applied })
      applied = true
    }
  }
  return applied
}

/* ------------------------------------------------------------------ */
/* Public booking                                                      */
/* ------------------------------------------------------------------ */

export const bookingDetailsSchema = z.object({
  customer_name: z.string().trim().min(1, 'Enter your name.').max(120, 'Name is too long.'),
  customer_phone: phoneSchema,
  customer_email: z
    .string()
    .trim()
    .max(255, 'Email is too long.')
    .refine((v) => v === '' || z.email().safeParse(v).success, 'Enter a valid email address.'),
  notes: z.string().trim().max(500, 'Keep notes under 500 characters.'),
})
export type BookingDetailsValues = z.infer<typeof bookingDetailsSchema>
