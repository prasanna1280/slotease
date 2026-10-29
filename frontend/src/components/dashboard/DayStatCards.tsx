import { CalendarCheck, CircleCheck, IndianRupee, UserX } from 'lucide-react'
import { QueryErrorAlert } from '@/components/dashboard/QueryErrorAlert'
import { StatCard } from '@/components/ui/stat-card'
import { useDaySummary } from '@/hooks/useStats'
import { formatTime } from '@/lib/datetime'
import { formatMoney } from '@/lib/money'

export interface DayStatCardsProps {
  date: string
  timezone: string
  currency: string
}

/** Bookings / Completed / No-shows / Est. revenue for one day (`/stats/summary`). */
export function DayStatCards({ date, timezone, currency }: DayStatCardsProps) {
  const summary = useDaySummary(date)

  if (summary.isError) {
    return (
      <QueryErrorAlert
        title="Could not load the day summary"
        error={summary.error}
        onRetry={() => void summary.refetch()}
        retrying={summary.isFetching}
      />
    )
  }

  const s = summary.data
  const loading = summary.isPending
  const next = s?.next_appointment

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      <StatCard
        label="Bookings"
        icon={CalendarCheck}
        tone="primary"
        loading={loading}
        value={s?.total ?? 0}
        hint={next ? `Next: ${formatTime(next.start_time, timezone)} · ${next.customer_name}` : `${s?.booked ?? 0} still booked`}
      />
      <StatCard label="Completed" icon={CircleCheck} tone="success" loading={loading} value={s?.completed ?? 0} />
      <StatCard
        label="No-shows"
        icon={UserX}
        tone="warning"
        loading={loading}
        value={s?.no_shows ?? 0}
        hint={s && s.cancelled > 0 ? `${s.cancelled} cancelled` : undefined}
      />
      <StatCard
        label="Est. revenue"
        icon={IndianRupee}
        loading={loading}
        value={formatMoney(s?.revenue_estimate ?? 0, currency)}
        hint="Booked + completed"
      />
    </div>
  )
}
