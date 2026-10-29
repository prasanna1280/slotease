import { CalendarCheck, CalendarDays, ChartColumn, CircleCheck, IndianRupee, UserPlus, UserX } from 'lucide-react'
import { useState } from 'react'
import { QueryErrorAlert } from '@/components/dashboard/QueryErrorAlert'
import { DailyBookingsChart } from '@/components/reports/DailyBookingsChart'
import { TopServicesTable } from '@/components/reports/TopServicesTable'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { StatCard } from '@/components/ui/stat-card'
import { useCurrentBusiness } from '@/hooks/useAuth'
import { useMonthStats } from '@/hooks/useStats'
import { currentMonthInTz, formatMonth } from '@/lib/datetime'
import { formatMoney } from '@/lib/money'

export default function ReportsPage() {
  const business = useCurrentBusiness()
  const thisMonth = currentMonthInTz(business.timezone)
  const [month, setMonth] = useState(thisMonth)
  const stats = useMonthStats(month)
  const s = stats.data
  const loading = stats.isPending

  return (
    <>
      <PageHeader
        title="Reports"
        description={`Bookings, no-shows and revenue for ${formatMonth(month)}.`}
        actions={
          <div className="flex items-center gap-2">
            <label htmlFor="report-month" className="text-sm font-medium text-foreground">
              Month
            </label>
            <Input
              id="report-month"
              type="month"
              value={month}
              max={thisMonth}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
              className="w-44"
            />
          </div>
        }
      />

      {stats.isError ? (
        <QueryErrorAlert
          title="Could not load reports"
          error={stats.error}
          onRetry={() => void stats.refetch()}
          retrying={stats.isFetching}
        />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6 xl:gap-4">
            <StatCard label="Total bookings" icon={CalendarCheck} tone="primary" loading={loading} value={s?.total_bookings ?? 0} hint={s ? `${s.cancelled} cancelled` : undefined} />
            <StatCard label="Completed" icon={CircleCheck} tone="success" loading={loading} value={s?.completed ?? 0} />
            <StatCard label="No-show rate" icon={UserX} tone="warning" loading={loading} value={`${s?.no_show_rate ?? 0}%`} hint={s ? `${s.no_shows} no-shows` : undefined} />
            <StatCard label="Revenue est." icon={IndianRupee} loading={loading} value={formatMoney(s?.revenue_estimate ?? 0, business.currency)} hint="Booked + completed" />
            <StatCard label="New customers" icon={UserPlus} loading={loading} value={s?.new_customers ?? 0} />
            <StatCard label="Busiest day" icon={CalendarDays} loading={loading} value={s?.busiest_day ?? '—'} />
          </div>

          {loading ? (
            <Skeleton className="h-80" />
          ) : s && s.total_bookings === 0 ? (
            <EmptyState
              icon={ChartColumn}
              title={`No bookings in ${formatMonth(month)}`}
              description="Charts and top services appear once appointments are booked in this month."
            />
          ) : s ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Card>
                <CardHeader>
                  <CardTitle>Daily bookings</CardTitle>
                  <CardDescription>Non-cancelled appointments per day.</CardDescription>
                </CardHeader>
                <CardContent>
                  <DailyBookingsChart daily={s.daily} />
                </CardContent>
              </Card>
              <Card className="overflow-hidden">
                <CardHeader>
                  <CardTitle>Top services</CardTitle>
                  <CardDescription>By number of bookings.</CardDescription>
                </CardHeader>
                <div className="border-t border-border">
                  <TopServicesTable services={s.top_services} currency={business.currency} />
                </div>
              </Card>
            </div>
          ) : null}
        </div>
      )}
    </>
  )
}
