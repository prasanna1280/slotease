import { Link } from 'react-router-dom'
import { BusinessTable, type DateColumn } from '@/admin/components/BusinessTable'
import { ADMIN_STATUS_LABEL, ADMIN_STATUSES } from '@/admin/format'
import { useAdminSubscriptions } from '@/admin/hooks'
import type { BusinessRow } from '@/admin/types'
import { QueryErrorAlert } from '@/components/dashboard/QueryErrorAlert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { StatCard } from '@/components/ui/stat-card'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatMoney } from '@/lib/money'

function ListCard({
  title,
  description,
  rows,
  dateColumn,
  empty,
}: {
  title: string
  description: string
  rows: BusinessRow[] | undefined
  dateColumn: DateColumn
  empty: string
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>
          {title}
          {rows ? <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">{rows.length}</span> : null}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {!rows ? (
          <Skeleton className="m-6 h-24" />
        ) : rows.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">{empty}</p>
        ) : (
          <BusinessTable rows={rows} dateColumn={dateColumn} />
        )}
      </CardContent>
    </Card>
  )
}

export default function AdminSubscriptionsPage() {
  useDocumentTitle('Subscriptions')
  const query = useAdminSubscriptions()
  const data = query.data

  return (
    <div className="space-y-6">
      <PageHeader title="Subscriptions" description="Plan status of every customer and who needs attention this week." />

      {query.isError && (
        <QueryErrorAlert title="Could not load subscriptions" error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
      )}

      <section aria-label="Subscription counts" className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        <StatCard label="MRR" loading={!data} value={data ? formatMoney(data.mrr) : ''} className="col-span-2 sm:col-span-1" />
        {ADMIN_STATUSES.map((status) => (
          <Link
            key={status}
            to={`/admin/customers?status=${status}`}
            className="rounded-lg focus-visible:outline-2 focus-visible:outline-ring"
          >
            <StatCard label={ADMIN_STATUS_LABEL[status]} loading={!data} value={data?.status_counts[status] ?? ''} className="h-full hover:border-primary/40" />
          </Link>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <ListCard
          title="Trials ending in 7 days"
          description="Good moment to reach out and help them subscribe."
          rows={data?.trials_ending_soon}
          dateColumn="trial_end"
          empty="No trials end this week."
        />
        <ListCard
          title="Renewals in 7 days"
          description="Active subscriptions about to be charged again."
          rows={data?.renewals_due}
          dateColumn="period_end"
          empty="No renewals this week."
        />
        <ListCard
          title="Payment due"
          description="Razorpay could not charge them. Booking stops when the paid period ends."
          rows={data?.past_due}
          dateColumn="period_end"
          empty="No failed payments."
        />
        <ListCard
          title="Cancelled in the last 30 days"
          description="They keep access until their paid period ends."
          rows={data?.recently_cancelled}
          dateColumn="period_end"
          empty="No recent cancellations."
        />
      </div>
    </div>
  )
}
