import { CalendarX2, ChevronRight } from 'lucide-react'
import { CALENDAR_BLOCK_CLASSES } from '@/components/calendar/calendar-styles'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatDuration, formatTime, toYmdInTz } from '@/lib/datetime'
import { cn } from '@/lib/utils'
import type { AppointmentOut } from '@/types/api'

const CHIP_WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' })

export interface DayAgendaProps {
  days: string[]
  today: string
  selected: string
  onSelectDay: (ymd: string) => void
  appointments: AppointmentOut[]
  timezone: string
  onSelect: (appointment: AppointmentOut) => void
}

/** Below md: 7 day chips plus a vertical list for the chosen day. */
export function DayAgenda({ days, today, selected, onSelectDay, appointments, timezone, onSelect }: DayAgendaProps) {
  const counts = new Map<string, number>()
  for (const a of appointments) {
    if (a.status === 'cancelled') continue
    const ymd = toYmdInTz(a.start_time, timezone)
    counts.set(ymd, (counts.get(ymd) ?? 0) + 1)
  }
  const dayItems = appointments.filter((a) => toYmdInTz(a.start_time, timezone) === selected)

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Day of week" className="grid grid-cols-7 gap-1">
        {days.map((ymd) => {
          const active = ymd === selected
          const count = counts.get(ymd) ?? 0
          return (
            <button
              key={ymd}
              type="button"
              aria-pressed={active}
              onClick={() => onSelectDay(ymd)}
              className={cn(
                'flex min-h-14 flex-col items-center justify-center rounded-md border text-xs transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-foreground hover:bg-muted',
              )}
            >
              <span className={cn('font-medium', !active && ymd === today && 'text-primary')}>
                {CHIP_WEEKDAY.format(new Date(`${ymd}T12:00:00Z`))}
              </span>
              <span className="text-base font-semibold tabular-nums">{Number(ymd.slice(8, 10))}</span>
              <span className={cn('tabular-nums', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                {count > 0 ? count : '–'}
                <span className="sr-only"> appointments</span>
              </span>
            </button>
          )
        })}
      </div>

      {dayItems.length === 0 ? (
        <EmptyState icon={CalendarX2} title="No appointments" description="Nothing is booked on this day." />
      ) : (
        <ul className="space-y-2">
          {dayItems.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => onSelect(a)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md border border-border border-l-4 p-3 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  CALENDAR_BLOCK_CLASSES[a.status],
                )}
              >
                <div className="w-16 shrink-0">
                  <p className="text-sm font-semibold tabular-nums">{formatTime(a.start_time, timezone)}</p>
                  <p className="text-xs opacity-80">{formatDuration(a.duration_min)}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className={cn('truncate font-medium', a.status === 'cancelled' && 'line-through')}>
                    {a.customer_name}
                  </p>
                  <p className="truncate text-sm opacity-80">{a.service_name}</p>
                </div>
                <StatusBadge status={a.status} className="hidden min-[400px]:inline-flex" />
                <ChevronRight className="size-4 shrink-0 opacity-60" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
