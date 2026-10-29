import { CalendarDays, CalendarX, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { groupSlots } from '@/components/booking/booking-utils'
import { StepHeading } from '@/components/booking/BookingStepper'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { addDays, browserTimezone, formatDate, formatDayLabel, formatDuration, formatTime } from '@/lib/datetime'
import { getErrorCode, getErrorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import type { PublicServiceOut, Slot, SlotsOut } from '@/types/api'

const STRIP_DAYS = 14

export interface DateTimeStepProps {
  service: PublicServiceOut
  timezone: string
  today: string
  /** Last bookable date (today + booking window). */
  maxDate: string
  date: string
  onDateChange: (ymd: string) => void
  slots: SlotsOut | undefined
  isLoading: boolean
  error: unknown
  onRetry: () => void
  selectedSlot: Slot | null
  onSelectSlot: (slot: Slot) => void
  /** Shown above the slots, e.g. after a SLOT_TAKEN conflict. */
  notice: string | null
  onChangeService: () => void
  focusOnMount: boolean
}

export function DateTimeStep({
  service,
  timezone,
  today,
  maxDate,
  date,
  onDateChange,
  slots,
  isLoading,
  error,
  onRetry,
  selectedSlot,
  onSelectSlot,
  notice,
  onChangeService,
  focusOnMount,
}: DateTimeStepProps) {
  const viewerTz = browserTimezone()
  const showTzNote = viewerTz !== undefined && viewerTz !== timezone

  return (
    <section aria-labelledby="step-datetime-title">
      <StepHeading
        id="step-datetime-title"
        title="Pick a date and time"
        description={
          <>
            {service.name} · {formatDuration(service.duration_min)}
          </>
        }
        focusOnMount={focusOnMount}
        action={
          <Button variant="ghost" size="sm" onClick={onChangeService} className="-mr-2 text-primary">
            Change
            <span className="sr-only"> service</span>
          </Button>
        }
      />

      {notice && (
        <Alert variant="warning" className="mb-5">
          <AlertTitle>That time is no longer available</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      <DateStrip today={today} maxDate={maxDate} date={date} onChange={onDateChange} />

      <div className="mt-6">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3 className="text-sm font-semibold text-foreground">{formatDate(date)}</h3>
          {showTzNote && <p className="text-xs text-muted-foreground">Times in {timezone.replace(/_/g, ' ')}</p>}
        </div>
        <SlotPicker
          date={date}
          maxDate={maxDate}
          timezone={timezone}
          slots={slots}
          isLoading={isLoading}
          error={error}
          onRetry={onRetry}
          selectedSlot={selectedSlot}
          onSelectSlot={onSelectSlot}
          onNextDay={() => onDateChange(addDays(date, 1))}
        />
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */

interface DateStripProps {
  today: string
  maxDate: string
  date: string
  onChange: (ymd: string) => void
}

function DateStrip({ today, maxDate, date, onChange }: DateStripProps) {
  const days = useMemo(() => {
    const out: string[] = []
    for (let i = 0; i < STRIP_DAYS; i++) {
      const d = addDays(today, i)
      if (d > maxDate) break
      out.push(d)
    }
    return out
  }, [today, maxDate])

  const stripRef = useRef<HTMLDivElement>(null)

  // Keep the selected chip visible when the date is changed from the date input or "Next day".
  useEffect(() => {
    const chip = stripRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]')
    chip?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [date])

  const outsideStrip = !days.includes(date)

  return (
    <div>
      <div
        ref={stripRef}
        role="group"
        aria-label="Choose a date"
        className="scrollbar-none -mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:scroll-px-6 sm:px-6"
      >
        {days.map((d, i) => {
          const [weekday, dayNum, month] = formatDayLabel(d).split(' ')
          const selected = d === date
          const top = i === 0 ? 'Today' : i === 1 ? 'Tmrw' : weekday
          return (
            <button
              key={d}
              type="button"
              onClick={() => onChange(d)}
              aria-pressed={selected}
              aria-label={`${i === 0 ? 'Today, ' : i === 1 ? 'Tomorrow, ' : ''}${formatDate(d)}`}
              className={cn(
                'flex h-[4.5rem] w-16 shrink-0 snap-start flex-col items-center justify-center rounded-lg border text-center transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-foreground hover:border-primary/60 hover:bg-muted',
              )}
            >
              <span className={cn('text-xs font-medium', selected ? 'text-primary-foreground' : 'text-muted-foreground')}>
                {top}
              </span>
              <span className="text-lg leading-tight font-semibold tabular-nums">{dayNum}</span>
              <span className={cn('text-xs', selected ? 'text-primary-foreground' : 'text-muted-foreground')}>
                {month}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-4 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
        <Label htmlFor="booking-date" className="flex items-center gap-1.5 text-muted-foreground">
          <CalendarDays className="size-4" aria-hidden="true" />
          Pick another date
        </Label>
        <Input
          id="booking-date"
          type="date"
          min={today}
          max={maxDate}
          value={date}
          onChange={(e) => {
            const v = e.target.value
            if (v && v >= today && v <= maxDate) onChange(v)
          }}
          className={cn('w-full tabular-nums sm:w-48', outsideStrip && 'border-primary ring-1 ring-primary')}
        />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

interface SlotPickerProps {
  date: string
  maxDate: string
  timezone: string
  slots: SlotsOut | undefined
  isLoading: boolean
  error: unknown
  onRetry: () => void
  selectedSlot: Slot | null
  onSelectSlot: (slot: Slot) => void
  onNextDay: () => void
}

const GRID = 'grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'

function SlotPicker({
  date,
  maxDate,
  timezone,
  slots,
  isLoading,
  error,
  onRetry,
  selectedSlot,
  onSelectSlot,
  onNextDay,
}: SlotPickerProps) {
  const groups = useMemo(() => groupSlots(slots?.slots ?? [], timezone), [slots, timezone])

  if (isLoading) {
    return (
      <div aria-busy="true" aria-label="Loading available times" className="space-y-5">
        <Skeleton className="h-3 w-20" />
        <div className={GRID}>
          {Array.from({ length: 9 }, (_, i) => (
            <Skeleton key={i} className="h-11" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    const serviceGone = getErrorCode(error) === 'SERVICE_NOT_FOUND'
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex flex-col items-start gap-3">
          <span>
            {serviceGone
              ? 'This service is no longer available. Please choose another service.'
              : getErrorMessage(error, 'We could not load available times.')}
          </span>
          {!serviceGone && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              Try again
            </Button>
          )}
        </AlertDescription>
      </Alert>
    )
  }

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={CalendarX}
        title="No free slots on this day"
        description="All times are booked or the business is closed. Try another date."
        action={
          date < maxDate ? (
            <Button variant="outline" onClick={onNextDay}>
              Check next day
              <ChevronRight aria-hidden="true" />
            </Button>
          ) : undefined
        }
      />
    )
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.id} role="group" aria-labelledby={`slots-${group.id}`}>
          <h4
            id={`slots-${group.id}`}
            className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
          >
            {group.label}
            <span className="font-normal normal-case tabular-nums">({group.slots.length})</span>
          </h4>
          <div className={GRID}>
            {group.slots.map((slot) => {
              const selected = selectedSlot?.start_time === slot.start_time
              return (
                <button
                  key={slot.start_time}
                  type="button"
                  onClick={() => onSelectSlot(slot)}
                  aria-pressed={selected}
                  className={cn(
                    'h-11 rounded-md border px-1 text-sm font-medium whitespace-nowrap tabular-nums transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                    selected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-foreground hover:border-primary hover:text-primary',
                  )}
                >
                  {formatTime(slot.start_time, timezone)}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
