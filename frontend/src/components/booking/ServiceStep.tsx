import { Check, Clock, Phone } from 'lucide-react'
import { StepHeading } from '@/components/booking/BookingStepper'
import { telHref } from '@/components/booking/booking-utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDuration } from '@/lib/datetime'
import { getErrorMessage } from '@/lib/errors'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { PublicBusinessOut, PublicServiceOut } from '@/types/api'

export interface ServiceStepProps {
  business: PublicBusinessOut
  services: PublicServiceOut[] | undefined
  isLoading: boolean
  error: unknown
  onRetry: () => void
  selectedId: number | null
  onSelect: (service: PublicServiceOut) => void
  focusOnMount: boolean
}

export function ServiceStep({
  business,
  services,
  isLoading,
  error,
  onRetry,
  selectedId,
  onSelect,
  focusOnMount,
}: ServiceStepProps) {
  return (
    <section aria-labelledby="step-service-title">
      <StepHeading
        id="step-service-title"
        title="Choose a service"
        description="Select what you would like to book."
        focusOnMount={focusOnMount}
      />

      {isLoading ? (
        <div className="grid gap-3" aria-busy="true" aria-label="Loading services">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 rounded-lg border border-border p-4">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40 max-w-full" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-5 w-14" />
            </div>
          ))}
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-col items-start gap-3">
            <span>{getErrorMessage(error, 'We could not load the services.')}</span>
            <Button variant="outline" size="sm" onClick={onRetry}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : !services || services.length === 0 ? (
        <EmptyState
          title="No services available yet"
          description={`${business.name} has not published any services for online booking. Please call to book.`}
          action={
            business.phone ? (
              <Button asChild variant="outline">
                <a href={telHref(business.phone)}>
                  <Phone aria-hidden="true" />
                  Call {business.phone}
                </a>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid gap-3" aria-label="Services">
          {services.map((service) => {
            const selected = service.id === selectedId
            return (
              <li key={service.id}>
                <button
                  type="button"
                  onClick={() => onSelect(service)}
                  aria-pressed={selected}
                  className={cn(
                    'flex min-h-[4.5rem] w-full items-center gap-4 rounded-lg border bg-card p-4 text-left transition-colors duration-150 hover:border-primary/60 hover:bg-primary-subtle/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                    selected ? 'border-primary bg-primary-subtle ring-1 ring-primary' : 'border-border',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium break-words text-foreground">{service.name}</span>
                    {service.description && (
                      <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">
                        {service.description}
                      </span>
                    )}
                    <span className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Clock className="size-3.5" aria-hidden="true" />
                      {formatDuration(service.duration_min)}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-2">
                    <span className="font-semibold text-foreground tabular-nums">
                      {formatMoney(service.price, business.currency)}
                    </span>
                    <span
                      className={cn(
                        'flex size-5 items-center justify-center rounded-full border',
                        selected ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                      )}
                      aria-hidden="true"
                    >
                      {selected && <Check className="size-3" strokeWidth={3} />}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
