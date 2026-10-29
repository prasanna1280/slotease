import { useMemo } from 'react'
import { layoutDay, offsetPercent, type GridRange } from '@/components/calendar/calendar-layout'
import { CALENDAR_BLOCK_CLASSES, useNow } from '@/components/calendar/calendar-styles'
import { APPOINTMENT_STATUS_LABEL } from '@/components/ui/status-badge'
import { formatHhmm, formatTime, minutesSinceMidnight, minutesToHhmm, toYmdInTz } from '@/lib/datetime'
import { cn } from '@/lib/utils'
import type { AppointmentOut } from '@/types/api'

export interface WeekGridProps {
  days: string[]
  today: string
  appointments: AppointmentOut[]
  range: GridRange
  timezone: string
  onSelect: (appointment: AppointmentOut) => void
}

const DAY_HEADER = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' })

function dayParts(ymd: string): { weekday: string; day: number } {
  return { weekday: DAY_HEADER.format(new Date(`${ymd}T12:00:00Z`)), day: Number(ymd.slice(8, 10)) }
}

/**
 * Week time-grid (md+). Hour rows have a fixed height (h-16), so blocks are positioned in percent of the
 * day column. The scroll container has a dvh-based max height with sticky day headers and time axis.
 */
export function WeekGrid({ days, today, appointments, range, timezone, onSelect }: WeekGridProps) {
  const now = useNow()
  const hours = useMemo(() => {
    const list: number[] = []
    for (let m = range.startMin; m < range.endMin; m += 60) list.push(m)
    return list
  }, [range])

  const byDay = useMemo(() => {
    const map = new Map<string, AppointmentOut[]>()
    for (const a of appointments) {
      const ymd = toYmdInTz(a.start_time, timezone)
      map.set(ymd, [...(map.get(ymd) ?? []), a])
    }
    return map
  }, [appointments, timezone])

  const nowOffset = days.includes(today) ? offsetPercent(minutesSinceMidnight(now, timezone), range) : null

  return (
    <div className="max-h-[calc(100dvh-15rem)] min-h-[24rem] overflow-auto rounded-lg border border-border bg-card shadow-sm">
      <div className="grid min-w-[52rem] grid-cols-[4rem_repeat(7,minmax(0,1fr))]">
        {/* Sticky header row */}
        <div className="sticky top-0 left-0 z-30 border-r border-b border-border bg-card" aria-hidden="true" />
        {days.map((ymd) => {
          const { weekday, day } = dayParts(ymd)
          const isToday = ymd === today
          return (
            <div
              key={ymd}
              className="sticky top-0 z-20 flex flex-col items-center justify-center border-b border-l border-border bg-card py-2"
            >
              <span className={cn('text-xs font-medium uppercase', isToday ? 'text-primary' : 'text-muted-foreground')}>
                {weekday}
              </span>
              <span
                className={cn(
                  'mt-0.5 flex size-8 items-center justify-center rounded-full text-base font-semibold tabular-nums',
                  isToday ? 'bg-primary text-primary-foreground' : 'text-foreground',
                )}
                aria-current={isToday ? 'date' : undefined}
              >
                {day}
              </span>
            </div>
          )
        })}

        {/* Time axis */}
        <div className="sticky left-0 z-10 border-r border-border bg-card">
          {hours.map((m) => (
            <div key={m} className="relative h-16">
              <span className="absolute -top-2 right-2 text-[11px] text-muted-foreground tabular-nums">
                {m === range.startMin ? '' : formatHhmm(minutesToHhmm(m))}
              </span>
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map((ymd) => {
          const blocks = layoutDay(byDay.get(ymd) ?? [], timezone, range)
          return (
            <div key={ymd} className={cn('relative border-l border-border', ymd === today && 'bg-primary-subtle/40')}>
              {hours.map((m) => (
                <div key={m} className="h-16 border-b border-border/70 last:border-b-0" aria-hidden="true" />
              ))}

              {blocks.map(({ appointment: a, top, height, lane, lanes }) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onSelect(a)}
                  aria-label={`${formatTime(a.start_time, timezone)} ${a.customer_name}, ${a.service_name}, ${APPOINTMENT_STATUS_LABEL[a.status]}`}
                  className={cn(
                    'absolute overflow-hidden rounded-sm border-l-4 px-1.5 py-0.5 text-left text-xs leading-tight transition-colors duration-150 focus-visible:z-20 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
                    CALENDAR_BLOCK_CLASSES[a.status],
                  )}
                  // Computed geometry from the time-grid maths; these values cannot be expressed as static
                  // Tailwind classes, so this is the one place the owner app uses an inline style.
                  style={{
                    top: `${top}%`,
                    height: `${height}%`,
                    left: `calc(${(lane * 100) / lanes}% + 2px)`,
                    width: `calc(${100 / lanes}% - 4px)`,
                  }}
                >
                  <span className={cn('block truncate font-semibold', a.status === 'cancelled' && 'line-through')}>
                    {a.customer_name}
                  </span>
                  <span className="block truncate tabular-nums opacity-80">
                    {formatTime(a.start_time, timezone)} · {a.service_name}
                  </span>
                </button>
              ))}

              {ymd === today && nowOffset !== null && (
                <div
                  className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-red-600"
                  // Computed position of the current-time line (see note above).
                  style={{ top: `${nowOffset}%` }}
                  aria-hidden="true"
                >
                  <span className="absolute -top-[5px] -left-1 size-2 rounded-full bg-red-600" />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
