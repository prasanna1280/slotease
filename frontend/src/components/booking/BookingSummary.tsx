import { CalendarDays, Clock, Tag } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatDate, formatDateTime, formatDuration, formatTimeRange } from '@/lib/datetime'
import { formatMoney } from '@/lib/money'
import type { PublicServiceOut, Slot } from '@/types/api'

export interface BookingCta {
  label: string
  onClick?: () => void
  /** Submit this form instead of calling onClick. */
  form?: string
  disabled?: boolean
  loading?: boolean
}

interface SummaryProps {
  service: PublicServiceOut | null
  slot: Slot | null
  date: string | null
  timezone: string
  currency: string
  cta: BookingCta | null
}

function CtaButton({ cta, className }: { cta: BookingCta; className?: string }) {
  return (
    <Button
      type={cta.form ? 'submit' : 'button'}
      form={cta.form}
      onClick={cta.onClick}
      disabled={cta.disabled}
      loading={cta.loading}
      size="lg"
      className={className}
    >
      {cta.label}
    </Button>
  )
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-muted-foreground" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="text-sm font-medium break-words text-foreground">{children}</dd>
      </div>
    </div>
  )
}

/** Desktop (lg+) sticky summary card with the step's primary action. */
export function BookingSummary({ service, slot, date, timezone, currency, cta }: SummaryProps) {
  return (
    <Card className="p-5" aria-labelledby="booking-summary-title">
      <h2 id="booking-summary-title" className="text-sm font-semibold text-foreground">
        Booking summary
      </h2>
      {service ? (
        <dl className="mt-4 space-y-4">
          <Row icon={<Tag className="size-4" />} label="Service">
            {service.name}
            <span className="block text-xs font-normal text-muted-foreground">
              {formatDuration(service.duration_min)}
            </span>
          </Row>
          <Row icon={<CalendarDays className="size-4" />} label="Date">
            {date ? formatDate(date) : <span className="font-normal text-muted-foreground">Not selected</span>}
          </Row>
          <Row icon={<Clock className="size-4" />} label="Time">
            {slot ? (
              <span className="tabular-nums">{formatTimeRange(slot.start_time, slot.end_time, timezone)}</span>
            ) : (
              <span className="font-normal text-muted-foreground">Not selected</span>
            )}
          </Row>
          <div className="flex items-center justify-between border-t border-border pt-4">
            <dt className="text-sm text-muted-foreground">Total</dt>
            <dd className="text-base font-semibold text-foreground tabular-nums">
              {formatMoney(service.price, currency)}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Choose a service to get started.</p>
      )}
      {cta && <CtaButton cta={cta} className="mt-5 w-full" />}
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Pay at the venue. No account needed.</p>
    </Card>
  )
}

/** Mobile sticky bottom bar: compact summary + the step's primary action, above the home indicator. */
export function MobileBookingBar({ service, slot, timezone, currency, cta }: SummaryProps) {
  if (!service || !cta) return null
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card px-safe shadow-[0_-1px_3px_rgb(15_23_42/0.06)]"
      role="region"
      aria-label="Booking summary"
    >
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 pt-3 pb-safe-4 sm:px-6">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{service.name}</p>
          <p className="truncate text-xs text-muted-foreground tabular-nums">
            {slot
              ? formatDateTime(slot.start_time, timezone)
              : formatDuration(service.duration_min)}
            {' · '}
            {formatMoney(service.price, currency)}
          </p>
        </div>
        <CtaButton cta={cta} className="shrink-0 px-5" />
      </div>
    </div>
  )
}
