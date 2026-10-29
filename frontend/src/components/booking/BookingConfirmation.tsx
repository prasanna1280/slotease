import { CalendarPlus, Check, CircleCheck, Copy, Phone } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { telHref } from '@/components/booking/booking-utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatDate, formatTimeRange } from '@/lib/datetime'
import { buildIcs, downloadIcs } from '@/lib/ics'
import { formatMoney } from '@/lib/money'
import type { BookingConfirmationOut, PublicBusinessOut } from '@/types/api'

export interface BookingConfirmationProps {
  booking: BookingConfirmationOut
  business: PublicBusinessOut
  onBookAnother: () => void
}

export function BookingConfirmation({ booking, business, onBookAnother }: BookingConfirmationProps) {
  const tz = business.timezone
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const el = headingRef.current
    if (!el) return
    el.focus({ preventScroll: true })
    el.scrollIntoView({ block: 'center' })
  }, [])

  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(t)
  }, [copied])

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(booking.booking_id)
      setCopied(true)
      toast.success('Booking ID copied')
    } catch {
      toast.error('Could not copy. Please note the booking ID down.')
    }
  }

  const addToCalendar = () => {
    try {
      const ics = buildIcs({
        uid: `${booking.booking_id}@slotease.app`,
        title: `${booking.service} at ${booking.business_name}`,
        start: booking.start_time,
        end: booking.end_time,
        description: `Booking ID: ${booking.booking_id}\nBooked via SlotEase. Call ${business.phone} to make changes.`,
        location: business.address ?? business.name,
      })
      downloadIcs(`${booking.booking_id}.ics`, ics)
    } catch {
      toast.error('Could not create the calendar file.')
    }
  }

  return (
    <Card className="mx-auto w-full max-w-xl p-5 sm:p-8">
      <div className="flex flex-col items-center text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-success-subtle">
          <CircleCheck className="size-8 text-success" aria-hidden="true" />
        </div>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="mt-4 scroll-mt-28 text-xl font-semibold tracking-tight text-foreground focus:outline-none sm:text-2xl"
        >
          You're booked!
        </h2>
        <p role="status" className="mt-2 text-sm text-muted-foreground sm:text-base">
          {booking.message}
        </p>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3 rounded-lg border border-border bg-muted px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Booking ID</p>
          <p className="font-mono text-sm font-semibold break-all text-foreground sm:text-base">{booking.booking_id}</p>
        </div>
        <Button variant="outline" size="sm" onClick={copyId} aria-label="Copy booking ID" className="shrink-0">
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          <span aria-hidden="true">{copied ? 'Copied' : 'Copy'}</span>
        </Button>
      </div>

      <dl className="mt-6 divide-y divide-border text-sm">
        {[
          ['Service', booking.service],
          ['Date', formatDate(booking.start_time, tz)],
          ['Time', formatTimeRange(booking.start_time, booking.end_time, tz)],
          ['Name', booking.customer_name],
          ['Price', `${formatMoney(booking.price, business.currency)} · pay at the venue`],
          ['Where', business.address ?? business.name],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5 py-3 sm:flex-row sm:justify-between sm:gap-6">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium break-words text-foreground tabular-nums sm:text-right">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button size="lg" className="w-full sm:flex-1" onClick={addToCalendar}>
          <CalendarPlus aria-hidden="true" />
          Add to calendar
        </Button>
        <Button size="lg" variant="outline" className="w-full sm:flex-1" onClick={onBookAnother}>
          Book another appointment
        </Button>
      </div>

      {business.phone && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Need to change or cancel?{' '}
          <a
            href={telHref(business.phone)}
            className="inline-flex min-h-11 items-center gap-1 font-medium text-primary hover:underline sm:min-h-0"
          >
            <Phone className="size-3.5" aria-hidden="true" />
            Call {business.phone}
          </a>
        </p>
      )}
    </Card>
  )
}
