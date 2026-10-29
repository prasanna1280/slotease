import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AppointmentDetailDialog } from '@/components/appointments/AppointmentDetailDialog'
import { computeGridRange } from '@/components/calendar/calendar-layout'
import { DayAgenda } from '@/components/calendar/DayAgenda'
import { WeekGrid } from '@/components/calendar/WeekGrid'
import { QueryErrorAlert } from '@/components/dashboard/QueryErrorAlert'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { APPOINTMENT_STATUS_DOT, APPOINTMENT_STATUS_LABEL } from '@/components/ui/status-badge'
import { Switch } from '@/components/ui/switch'
import { useRangeAppointments } from '@/hooks/useAppointments'
import { useCurrentBusiness } from '@/hooks/useAuth'
import { useWorkingHours } from '@/hooks/useWorkingHours'
import { addDays, formatDayLabel, isYmd, startOfWeek, todayInTz, weekDays } from '@/lib/datetime'
import { cn } from '@/lib/utils'
import { APPOINTMENT_STATUSES } from '@/types/api'

function weekLabel(days: string[]): string {
  const first = days[0] ?? ''
  const last = days[6] ?? ''
  return `${formatDayLabel(first)} – ${formatDayLabel(last)} ${last.slice(0, 4)}`
}

export default function CalendarPage() {
  const business = useCurrentBusiness()
  const tz = business.timezone
  const today = todayInTz(tz)
  const [params, setParams] = useSearchParams()
  const weekParam = params.get('week')
  const monday = startOfWeek(weekParam && isYmd(weekParam) ? weekParam : today)
  const days = weekDays(monday)
  const sunday = days[6] ?? monday
  const isThisWeek = days.includes(today)

  const [mobileDay, setMobileDay] = useState<string | null>(null)
  const selectedDay = mobileDay && days.includes(mobileDay) ? mobileDay : isThisWeek ? today : monday
  const [showCancelled, setShowCancelled] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const appointments = useRangeAppointments(monday, sunday)
  const hours = useWorkingHours()

  const visible = useMemo(
    () => (appointments.data ?? []).filter((a) => showCancelled || a.status !== 'cancelled'),
    [appointments.data, showCancelled],
  )
  const range = useMemo(() => computeGridRange(hours.data, visible, tz), [hours.data, visible, tz])
  const selected = appointments.data?.find((a) => a.id === selectedId) ?? null

  const goToWeek = (ymd: string) => {
    setMobileDay(null)
    setParams(ymd === startOfWeek(today) ? {} : { week: ymd }, { replace: true })
  }

  return (
    <>
      <PageHeader
        title="Calendar"
        description={<span className="tabular-nums">{weekLabel(days)}</span>}
        actions={
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="icon" onClick={() => goToWeek(addDays(monday, -7))} aria-label="Previous week">
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button variant="outline" onClick={() => goToWeek(startOfWeek(today))} disabled={isThisWeek}>
              This week
            </Button>
            <Button variant="outline" size="icon" onClick={() => goToWeek(addDays(monday, 7))} aria-label="Next week">
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Status legend">
          {APPOINTMENT_STATUSES.map((s) => (
            <li key={s} className="inline-flex items-center gap-1.5">
              <span className={cn('size-2.5 rounded-sm', APPOINTMENT_STATUS_DOT[s])} aria-hidden="true" />
              {APPOINTMENT_STATUS_LABEL[s]}
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3">
          <Switch id="show-cancelled" checked={showCancelled} onCheckedChange={setShowCancelled} />
          <label htmlFor="show-cancelled" className="text-sm text-foreground">
            Show cancelled
          </label>
        </div>
      </div>

      {appointments.isError ? (
        <QueryErrorAlert
          title="Could not load this week"
          error={appointments.error}
          onRetry={() => void appointments.refetch()}
          retrying={appointments.isFetching}
        />
      ) : appointments.isPending ? (
        <>
          <Skeleton className="hidden h-[28rem] md:block" />
          <div className="space-y-3 md:hidden">
            <Skeleton className="h-14" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        </>
      ) : (
        <>
          <div className="hidden md:block">
            <WeekGrid
              days={days}
              today={today}
              appointments={visible}
              range={range}
              timezone={tz}
              onSelect={(a) => setSelectedId(a.id)}
            />
          </div>
          <div className="md:hidden">
            <DayAgenda
              days={days}
              today={today}
              selected={selectedDay}
              onSelectDay={setMobileDay}
              appointments={visible}
              timezone={tz}
              onSelect={(a) => setSelectedId(a.id)}
            />
          </div>
        </>
      )}

      <AppointmentDetailDialog
        appointment={selected}
        onOpenChange={(open) => !open && setSelectedId(null)}
        timezone={tz}
        currency={business.currency}
      />
    </>
  )
}
