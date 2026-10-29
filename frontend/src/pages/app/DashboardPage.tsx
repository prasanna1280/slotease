import { CalendarPlus, CalendarX2, Plus } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AppointmentList } from '@/components/appointments/AppointmentList'
import { NewBookingDialog } from '@/components/appointments/NewBookingDialog'
import { BookingLinkBar } from '@/components/dashboard/BookingLinkBar'
import { DateSwitcher } from '@/components/dashboard/DateSwitcher'
import { DayStatCards } from '@/components/dashboard/DayStatCards'
import { GettingStartedCard } from '@/components/dashboard/GettingStartedCard'
import { MonthStrip } from '@/components/dashboard/MonthStrip'
import { QueryErrorAlert } from '@/components/dashboard/QueryErrorAlert'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { useDayAppointments } from '@/hooks/useAppointments'
import { useCurrentBusiness } from '@/hooks/useAuth'
import { useServices } from '@/hooks/useServices'
import { formatDayLabel, isYmd, todayInTz } from '@/lib/datetime'
import { pluralize } from '@/lib/utils'

/** "Today" — the owner's home screen: day stats, the day's appointments and quick actions. */
export default function DashboardPage() {
  const business = useCurrentBusiness()
  const tz = business.timezone
  const today = todayInTz(tz)
  const [params, setParams] = useSearchParams()
  const paramDate = params.get('date')
  const date = paramDate && isYmd(paramDate) ? paramDate : today
  const [bookingOpen, setBookingOpen] = useState(false)

  const appointments = useDayAppointments(date)
  const services = useServices(false)
  const noServices = services.isSuccess && services.data.length === 0

  const setDate = (ymd: string) => {
    setParams(ymd === today ? {} : { date: ymd }, { replace: true })
  }

  const isToday = date === today
  const title = isToday ? `Today, ${formatDayLabel(date)}` : formatDayLabel(date)
  const activeCount = appointments.data?.filter((a) => a.status !== 'cancelled').length ?? 0

  return (
    <>
      <PageHeader
        title={title}
        description={business.name}
        actions={
          <Button onClick={() => setBookingOpen(true)} disabled={noServices}>
            <Plus aria-hidden="true" />
            New booking
          </Button>
        }
      />

      <div className="space-y-6">
        {noServices && <GettingStartedCard slug={business.slug} hasServices={false} />}

        <DayStatCards date={date} timezone={tz} currency={business.currency} />

        <section aria-labelledby="day-appointments-heading" className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 id="day-appointments-heading" className="text-base font-semibold text-foreground">
                Appointments
              </h2>
              {appointments.data && (
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  {pluralize(activeCount, 'appointment')}
                </p>
              )}
            </div>
            <DateSwitcher value={date} today={today} onChange={setDate} />
          </div>

          {appointments.isError ? (
            <QueryErrorAlert
              title="Could not load appointments"
              error={appointments.error}
              onRetry={() => void appointments.refetch()}
              retrying={appointments.isFetching}
            />
          ) : (
            <AppointmentList
              appointments={appointments.data}
              loading={appointments.isPending}
              timezone={tz}
              currency={business.currency}
              empty={
                <EmptyState
                  icon={CalendarX2}
                  title={isToday ? 'No appointments today' : 'No appointments on this day'}
                  description="Bookings from your online page and ones you add here appear in this list."
                  action={
                    !noServices && (
                      <Button variant="outline" onClick={() => setBookingOpen(true)}>
                        <CalendarPlus aria-hidden="true" />
                        Add a booking
                      </Button>
                    )
                  }
                />
              }
            />
          )}
        </section>

        <MonthStrip month={date.slice(0, 7)} isCurrentMonth={date.slice(0, 7) === today.slice(0, 7)} />
        <BookingLinkBar slug={business.slug} />
      </div>

      <NewBookingDialog open={bookingOpen} onOpenChange={setBookingOpen} business={business} defaultDate={date} />
    </>
  )
}
