import { z } from 'zod'
import type { ServiceCreate, ServiceOut } from '@/types/api'

export const DURATION_MIN = 5
export const DURATION_MAX = 480
const PRICE_MAX = 99_999_999.99
const PRICE_RE = /^\d+(\.\d{1,2})?$/

/** Mirrors the backend: name required (≤120), duration 5–480 whole minutes, price ≥ 0 with ≤ 2 decimals. */
export const serviceSchema = z.object({
  name: z.string().trim().min(1, 'Enter a service name.').max(120, 'Name must be at most 120 characters.'),
  description: z.string().trim().max(500, 'Description must be at most 500 characters.'),
  duration_min: z
    .string()
    .trim()
    .min(1, 'Enter a duration in minutes.')
    .refine((v) => /^\d+$/.test(v), 'Use whole minutes.')
    .refine(
      (v) => Number(v) >= DURATION_MIN && Number(v) <= DURATION_MAX,
      `Duration must be between ${DURATION_MIN} and ${DURATION_MAX} minutes.`,
    ),
  price: z
    .string()
    .trim()
    .min(1, 'Enter a price (0 for free).')
    .refine((v) => !v.startsWith('-'), 'Price cannot be negative.')
    .refine((v) => v.startsWith('-') || PRICE_RE.test(v), 'Use a number with up to 2 decimals, e.g. 450 or 99.50.')
    .refine((v) => !PRICE_RE.test(v) || Number(v) <= PRICE_MAX, 'Price is too large.'),
})

export type ServiceFormValues = z.infer<typeof serviceSchema>

export const EMPTY_SERVICE_FORM: ServiceFormValues = { name: '', description: '', duration_min: '30', price: '' }

export function serviceToForm(s: ServiceOut): ServiceFormValues {
  return {
    name: s.name,
    description: s.description ?? '',
    duration_min: String(s.duration_min),
    price: String(Number(s.price)),
  }
}

export function formToServicePayload(v: ServiceFormValues): ServiceCreate {
  return {
    name: v.name.trim(),
    description: v.description.trim() || null,
    duration_min: Number(v.duration_min),
    price: Number(v.price).toFixed(2),
  }
}

/** "₹" for INR, "$" for USD … (falls back to the ISO code). */
export function currencySymbol(currency: string): string {
  try {
    return (
      new Intl.NumberFormat('en-IN', { style: 'currency', currency })
        .formatToParts(0)
        .find((p) => p.type === 'currency')?.value ?? currency
    )
  } catch {
    return currency
  }
}
