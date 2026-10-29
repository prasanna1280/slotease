import type { AdminStatus } from '@/admin/types'
import type { BadgeVariant } from '@/components/ui/badge'

/** Timezone used for admin dates and report periods (matches the backend's ADMIN_REPORT_TIMEZONE). */
export const ADMIN_TZ = 'Asia/Kolkata'

export const ADMIN_STATUS_LABEL: Record<AdminStatus, string> = {
  trialing: 'Trial',
  trial_expired: 'Trial ended',
  active: 'Active',
  past_due: 'Payment due',
  cancelled: 'Cancelled',
  expired: 'Expired',
  suspended: 'Suspended',
}

export const ADMIN_STATUS_VARIANT: Record<AdminStatus, BadgeVariant> = {
  trialing: 'info',
  trial_expired: 'warning',
  active: 'success',
  past_due: 'destructive',
  cancelled: 'neutral',
  expired: 'neutral',
  suspended: 'destructive',
}

export const ADMIN_STATUSES: AdminStatus[] = [
  'trialing',
  'trial_expired',
  'active',
  'past_due',
  'cancelled',
  'expired',
  'suspended',
]

/** "+12.5%" / "-3%" / "—" for a change percentage. */
export function formatChange(pct: number | null): string {
  if (pct === null) return '—'
  const rounded = Math.round(pct * 10) / 10
  return `${rounded > 0 ? '+' : ''}${rounded}%`
}

/** Convert an `<input type="datetime-local">` value (admin timezone) to ISO with the IST offset. */
export function localInputToIso(value: string): string {
  return `${value.length === 16 ? `${value}:00` : value}+05:30`
}

/** ISO instant to the `<input type="datetime-local">` value in the admin timezone. */
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ADMIN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}
