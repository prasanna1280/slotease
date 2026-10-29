import { MapPin, Phone } from 'lucide-react'
import { telHref } from '@/components/booking/booking-utils'
import { Skeleton } from '@/components/ui/skeleton'
import { getInitials } from '@/lib/utils'
import type { PublicBusinessOut } from '@/types/api'

export function BusinessHeader({ business }: { business: PublicBusinessOut }) {
  return (
    <header className="flex items-start gap-4">
      <div
        className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-base font-semibold text-primary sm:size-14 sm:text-lg"
        aria-hidden="true"
      >
        {getInitials(business.name)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Book an appointment</p>
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight break-words text-foreground sm:text-2xl">
          {business.name}
        </h1>
        <div className="mt-1 flex flex-col gap-x-4 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center">
          {business.address && (
            <span className="flex min-h-8 items-start gap-1.5 sm:items-center">
              <MapPin className="mt-0.5 size-4 shrink-0 sm:mt-0" aria-hidden="true" />
              <span className="break-words">{business.address}</span>
            </span>
          )}
          {business.phone && (
            <a
              href={telHref(business.phone)}
              className="-ml-1 inline-flex min-h-11 w-fit items-center gap-1.5 rounded-md px-1 font-medium text-foreground tabular-nums hover:text-primary sm:min-h-8"
            >
              <Phone className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="sr-only">Call </span>
              {business.phone}
            </a>
          )}
        </div>
      </div>
    </header>
  )
}

export function BusinessHeaderSkeleton() {
  return (
    <div className="flex items-start gap-4" aria-hidden="true">
      <Skeleton className="size-12 rounded-lg sm:size-14" />
      <div className="flex-1 space-y-2 pt-1">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-6 w-56 max-w-full" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
    </div>
  )
}
