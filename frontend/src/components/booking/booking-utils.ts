import { useSyncExternalStore } from 'react'
import { formatTime24, hhmmToMinutes } from '@/lib/datetime'
import type { BookingDetailsValues } from '@/lib/validation'
import type { Slot } from '@/types/api'

/* ------------------------------------------------------------------ */
/* Steps                                                               */
/* ------------------------------------------------------------------ */

export type BookingStep = 'service' | 'datetime' | 'details' | 'confirmed'

export const BOOKING_STEPS: readonly { id: BookingStep; label: string }[] = [
  { id: 'service', label: 'Service' },
  { id: 'datetime', label: 'Date & time' },
  { id: 'details', label: 'Your details' },
  { id: 'confirmed', label: 'Confirmed' },
]

export function stepIndex(step: BookingStep): number {
  return BOOKING_STEPS.findIndex((s) => s.id === step)
}

/* ------------------------------------------------------------------ */
/* Slot grouping                                                       */
/* ------------------------------------------------------------------ */

export type DayPeriod = 'morning' | 'afternoon' | 'evening'

export interface SlotGroup {
  id: DayPeriod
  label: string
  slots: Slot[]
}

const PERIOD_LABELS: Record<DayPeriod, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
}

/** Period of a slot in the business timezone: before 12:00, 12:00–16:59, 17:00 onwards. */
export function slotPeriod(slot: Slot, timezone: string): DayPeriod {
  const hhmm = /^\d{2}:\d{2}$/.test(slot.label) ? slot.label : formatTime24(slot.start_time, timezone)
  const minutes = hhmmToMinutes(hhmm)
  if (minutes < 12 * 60) return 'morning'
  if (minutes < 17 * 60) return 'afternoon'
  return 'evening'
}

/** Split slots into Morning / Afternoon / Evening, dropping empty groups. */
export function groupSlots(slots: readonly Slot[], timezone: string): SlotGroup[] {
  const groups: Record<DayPeriod, Slot[]> = { morning: [], afternoon: [], evening: [] }
  for (const slot of slots) groups[slotPeriod(slot, timezone)].push(slot)
  return (Object.keys(groups) as DayPeriod[])
    .filter((id) => groups[id].length > 0)
    .map((id) => ({ id, label: PERIOD_LABELS[id], slots: groups[id] }))
}

/* ------------------------------------------------------------------ */
/* Remembered customer details (this device only)                      */
/* ------------------------------------------------------------------ */

const CUSTOMER_KEY = 'slotease.booking.customer'

export const EMPTY_DETAILS: BookingDetailsValues = {
  customer_name: '',
  customer_phone: '',
  customer_email: '',
  notes: '',
}

export interface RememberedCustomer {
  customer_name: string
  customer_phone: string
  customer_email: string
}

function isRemembered(value: unknown): value is RememberedCustomer {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.customer_name === 'string' && typeof v.customer_phone === 'string'
}

export function loadRememberedCustomer(): RememberedCustomer | null {
  try {
    const raw = window.localStorage.getItem(CUSTOMER_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isRemembered(parsed)) return null
    return {
      customer_name: parsed.customer_name,
      customer_phone: parsed.customer_phone,
      customer_email: typeof parsed.customer_email === 'string' ? parsed.customer_email : '',
    }
  } catch {
    return null
  }
}

export function saveRememberedCustomer(details: BookingDetailsValues): void {
  try {
    const value: RememberedCustomer = {
      customer_name: details.customer_name.trim(),
      customer_phone: details.customer_phone.trim(),
      customer_email: details.customer_email.trim(),
    }
    window.localStorage.setItem(CUSTOMER_KEY, JSON.stringify(value))
  } catch {
    // Storage unavailable (private mode / blocked): nothing to remember.
  }
}

export function forgetRememberedCustomer(): void {
  try {
    window.localStorage.removeItem(CUSTOMER_KEY)
  } catch {
    // ignore
  }
}

/* ------------------------------------------------------------------ */
/* Responsive helper                                                   */
/* ------------------------------------------------------------------ */

const DESKTOP_QUERY = '(min-width: 1024px)'

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => undefined
  const mql = window.matchMedia(DESKTOP_QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

function getSnapshot(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(DESKTOP_QUERY).matches
}

/** True at the `lg` breakpoint and above (two-column booking layout with a sticky summary). */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

/** Phone number suitable for a `tel:` link (digits and a leading +). */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}
