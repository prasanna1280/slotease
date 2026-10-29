import { ChartColumn } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import { useMonthStats } from '@/hooks/useStats'
import { formatMonth } from '@/lib/datetime'
import { pluralize } from '@/lib/utils'

/** One-line month context: "This month: 214 bookings · No-show rate 6% · Busiest day: Saturday". */
export function MonthStrip({ month, isCurrentMonth }: { month: string; isCurrentMonth: boolean }) {
  const stats = useMonthStats(month)

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-2 text-slate-700">
        <ChartColumn className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        {stats.isPending ? (
          <Skeleton className="h-4 w-64 max-w-full" />
        ) : stats.isError ? (
          <span className="text-muted-foreground">Monthly stats are unavailable right now.</span>
        ) : (
          <p className="min-w-0">
            <span className="font-medium text-foreground">
              {isCurrentMonth ? 'This month' : formatMonth(month)}:
            </span>{' '}
            <span className="tabular-nums">{pluralize(stats.data.total_bookings, 'booking')}</span>
            <span className="text-muted-foreground"> · </span>
            No-show rate <span className="tabular-nums">{stats.data.no_show_rate}%</span>
            {stats.data.busiest_day && (
              <>
                <span className="text-muted-foreground"> · </span>
                Busiest day: {stats.data.busiest_day}
              </>
            )}
          </p>
        )}
      </div>
      <Link to="/app/reports" className="shrink-0 font-medium text-primary hover:underline">
        View reports
      </Link>
    </div>
  )
}
