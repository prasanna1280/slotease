import { Check } from 'lucide-react'
import { Fragment, useEffect, useRef, type ReactNode } from 'react'
import { BOOKING_STEPS, stepIndex, type BookingStep } from '@/components/booking/booking-utils'
import { cn } from '@/lib/utils'

export interface BookingStepperProps {
  current: BookingStep
  /** Steps the customer may jump back to (completed steps). */
  canGoTo: (step: BookingStep) => boolean
  onGoTo: (step: BookingStep) => void
}

/** Progress indicator. Completed steps are buttons so customers can go back with keyboard or touch. */
export function BookingStepper({ current, canGoTo, onGoTo }: BookingStepperProps) {
  const currentIndex = stepIndex(current)
  return (
    <nav aria-label="Booking progress">
      <ol className="flex items-center gap-2">
        {BOOKING_STEPS.map((step, i) => {
          const state = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'upcoming'
          const clickable = state === 'done' && canGoTo(step.id)
          const marker = (
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums',
                state === 'done' && 'border-primary bg-primary text-primary-foreground',
                state === 'current' && 'border-primary bg-card text-primary ring-2 ring-primary/20',
                state === 'upcoming' && 'border-input bg-card text-muted-foreground',
              )}
              aria-hidden="true"
            >
              {state === 'done' ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
            </span>
          )
          const label = (
            <span
              className={cn(
                'truncate text-sm',
                state === 'current' ? 'font-semibold text-foreground' : 'hidden text-muted-foreground sm:inline',
              )}
            >
              {step.label}
            </span>
          )
          const srState = state === 'done' ? ' (completed)' : state === 'upcoming' ? ' (not started)' : ''
          return (
            <Fragment key={step.id}>
              {i > 0 && (
                <li
                  aria-hidden="true"
                  className={cn('h-px min-w-3 flex-1', i <= currentIndex ? 'bg-primary' : 'bg-border')}
                />
              )}
              <li className="flex min-w-0 shrink-0 items-center" aria-current={state === 'current' ? 'step' : undefined}>
                {clickable ? (
                  <button
                    type="button"
                    onClick={() => onGoTo(step.id)}
                    className="-m-2 flex min-h-11 items-center gap-2 rounded-md p-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring [&>span:last-child]:hover:text-foreground"
                  >
                    {marker}
                    {label}
                    <span className="sr-only">
                      {step.label}
                      {srState}, go back to this step
                    </span>
                  </button>
                ) : (
                  <span className="flex min-h-11 items-center gap-2">
                    {marker}
                    {label}
                    <span className="sr-only">
                      {step.label}
                      {srState}
                    </span>
                  </span>
                )}
              </li>
            </Fragment>
          )
        })}
      </ol>
    </nav>
  )
}

export interface StepHeadingProps {
  id: string
  title: string
  description?: ReactNode
  /** Move keyboard / screen-reader focus here when the step appears (not on first page load). */
  focusOnMount?: boolean
  action?: ReactNode
}

/** h2 for each step. Receives focus when the customer moves between steps. */
export function StepHeading({ id, title, description, focusOnMount = false, action }: StepHeadingProps) {
  const ref = useRef<HTMLHeadingElement>(null)
  const shouldFocus = useRef(focusOnMount)

  useEffect(() => {
    const el = ref.current
    if (!shouldFocus.current || !el) return
    el.focus({ preventScroll: true })
    el.scrollIntoView({ block: 'start' })
  }, [])

  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2
          id={id}
          ref={ref}
          tabIndex={-1}
          className="scroll-mt-28 text-lg font-semibold tracking-tight text-foreground focus:outline-none sm:text-xl"
        >
          {title}
        </h2>
        {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
