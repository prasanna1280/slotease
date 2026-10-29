import { CalendarX, Phone, RefreshCw, Store, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { telHref } from '@/components/booking/booking-utils'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { Button } from '@/components/ui/button'

function StatusShell({
  icon: Icon,
  title,
  children,
  actions,
}: {
  icon: LucideIcon
  title: string
  children: ReactNode
  actions: ReactNode
}) {
  return (
    <PublicLayout hideAuthActions className="items-center justify-center px-4 py-16 sm:py-24">
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <div className="mb-5 flex size-14 items-center justify-center rounded-full bg-muted">
          <Icon className="size-7 text-muted-foreground" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        <div className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">{children}</div>
        <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">{actions}</div>
      </div>
    </PublicLayout>
  )
}

export function BusinessNotFound({ slug }: { slug: string }) {
  return (
    <StatusShell
      icon={Store}
      title="Booking page not found"
      actions={
        <Button asChild size="lg" variant="outline">
          <Link to="/">Go to SlotEase home</Link>
        </Button>
      }
    >
      We couldn't find a business at <span className="font-medium break-all text-foreground">/{slug}</span>. Please
      check the link the business shared with you.
    </StatusShell>
  )
}

export function BookingUnavailable({ name, phone }: { name: string | null; phone: string | null }) {
  return (
    <StatusShell
      icon={CalendarX}
      title="Online booking is paused"
      actions={
        phone ? (
          <Button asChild size="lg">
            <a href={telHref(phone)}>
              <Phone aria-hidden="true" />
              Call {phone}
            </a>
          </Button>
        ) : null
      }
    >
      {name ? <span className="font-medium text-foreground">{name}</span> : 'This business'} isn't taking online
      bookings right now. {phone ? 'Please call to book your appointment.' : 'Please contact them directly to book.'}
    </StatusShell>
  )
}

export function BookingLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <StatusShell
      icon={RefreshCw}
      title="We couldn't load this page"
      actions={
        <Button size="lg" onClick={onRetry}>
          Try again
        </Button>
      }
    >
      {message}
    </StatusShell>
  )
}
