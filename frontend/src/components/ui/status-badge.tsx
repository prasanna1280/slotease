import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { AppointmentStatus, SubscriptionStatus } from '@/types/api'

export const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  booked: 'Booked',
  completed: 'Completed',
  no_show: 'No-show',
  cancelled: 'Cancelled',
}

const APPOINTMENT_STATUS_VARIANT: Record<AppointmentStatus, BadgeVariant> = {
  booked: 'info',
  completed: 'success',
  no_show: 'warning',
  cancelled: 'neutral',
}

/** Solid dot colours, also useful for calendar blocks / legends. */
export const APPOINTMENT_STATUS_DOT: Record<AppointmentStatus, string> = {
  booked: 'bg-blue-600',
  completed: 'bg-green-600',
  no_show: 'bg-amber-500',
  cancelled: 'bg-slate-400',
}

export interface StatusBadgeProps {
  status: AppointmentStatus
  className?: string
}

/** Appointment status pill: booked = blue, completed = green, no_show = amber, cancelled = slate. */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <Badge variant={APPOINTMENT_STATUS_VARIANT[status]} className={className}>
      <span className={cn('size-1.5 rounded-full', APPOINTMENT_STATUS_DOT[status])} aria-hidden="true" />
      {APPOINTMENT_STATUS_LABEL[status]}
    </Badge>
  )
}

export const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trialing: 'Trial',
  active: 'Active',
  past_due: 'Past due',
  cancelled: 'Cancelled',
  expired: 'Expired',
}

const SUBSCRIPTION_STATUS_VARIANT: Record<SubscriptionStatus, BadgeVariant> = {
  trialing: 'info',
  active: 'success',
  past_due: 'warning',
  cancelled: 'neutral',
  expired: 'destructive',
}

export interface SubscriptionBadgeProps {
  status: SubscriptionStatus
  className?: string
}

export function SubscriptionBadge({ status, className }: SubscriptionBadgeProps) {
  return (
    <Badge variant={SUBSCRIPTION_STATUS_VARIANT[status]} className={className}>
      {SUBSCRIPTION_STATUS_LABEL[status]}
    </Badge>
  )
}
