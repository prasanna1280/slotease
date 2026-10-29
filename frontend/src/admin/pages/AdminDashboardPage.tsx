import { Building2, CalendarCheck, IndianRupee, Repeat, TrendingUp, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AdminBarChart } from '@/admin/components/AdminBarChart'
import { BusinessTable } from '@/admin/components/BusinessTable'
import { ADMIN_STATUS_LABEL, ADMIN_STATUSES, ADMIN_TZ } from '@/admin/format'
import { useAdminOverview } from '@/admin/hooks'
import type { Overview } from '@/admin/types'
import { QueryErrorAlert } from '@/components/dashboard/QueryErrorAlert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { StatCard } from '@/components/ui/stat-card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatDate, formatDateTime } from '@/lib/datetime'
import { formatMoney, toNumber } from '@/lib/money'

function vsLastMonth(current: number, previous: number, unit = ''): string {
  if (previous === 0) return current > 0 ? `${current}${unit} this month, none last month` : 'None last month either'
  const pct = Math.round(((current - previous) / previous) * 100)
  return `${pct >= 0 ? '+' : ''}${pct}% vs last month`
}

function StatusBreakdown({ data }: { data: Overview }) {
  const total = data.businesses_total || 1
  return (
    <Card>
      <CardHeader>
        <CardTitle>Customers by status</CardTitle>
        <CardDescription>{data.businesses_total} businesses in total</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {ADMIN_STATUSES.map((status) => {
            const count = data.status_counts[status]
            return (
              <li key={status}>
                <Link
                  to={`/admin/customers?status=${status}`}
                  className="group block rounded-md focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="text-foreground group-hover:text-primary">{ADMIN_STATUS_LABEL[status]}</span>
                    <span className="font-medium text-foreground tabular-nums">{count}</span>
                  </div>
                  <svg className="mt-1 block h-1.5 w-full" aria-hidden="true" preserveAspectRatio="none">
                    <rect width="100%" height="100%" rx="3" className="fill-muted" />
                    {count > 0 && <rect width={`${(count / total) * 100}%`} height="100%" rx="3" className="fill-primary" />}
                  </svg>
                </Link>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}

export default function AdminDashboardPage() {
  useDocumentTitle('Admin dashboard')
  const overview = useAdminOverview()
  const data = overview.data

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={data ? `All SlotEase customers · updated ${formatDateTime(data.generated_at, ADMIN_TZ)} IST` : 'All SlotEase customers'}
      />

      {overview.isError && (
        <QueryErrorAlert
          title="Could not load the dashboard"
          error={overview.error}
          onRetry={() => void overview.refetch()}
          retrying={overview.isFetching}
        />
      )}

      <section aria-label="Key numbers" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Monthly recurring revenue"
          icon={TrendingUp}
          tone="primary"
          loading={!data}
          value={data ? formatMoney(data.mrr) : ''}
          hint={data ? `${data.paying_businesses} paying × ${formatMoney(data.plan_price)} · ARR ${formatMoney(data.arr)}` : undefined}
        />
        <StatCard
          label="Revenue this month"
          icon={IndianRupee}
          tone="success"
          loading={!data}
          value={data ? formatMoney(data.revenue_this_month) : ''}
          hint={data ? vsLastMonth(toNumber(data.revenue_this_month), toNumber(data.revenue_last_month)) : undefined}
        />
        <StatCard
          label="Customers (businesses)"
          icon={Building2}
          loading={!data}
          value={data?.businesses_total ?? ''}
          hint={data ? `${data.businesses_new_this_month} new this month · ${data.businesses_new_last_month} last month` : undefined}
        />
        <StatCard
          label="Trial conversion"
          icon={Repeat}
          tone="warning"
          loading={!data}
          value={data ? (data.trial_conversion_rate === null ? '—' : `${data.trial_conversion_rate}%`) : ''}
          hint="Finished trials that became paying"
        />
        <StatCard
          label="Revenue this quarter"
          icon={IndianRupee}
          loading={!data}
          value={data ? formatMoney(data.revenue_this_quarter) : ''}
          hint={data ? `This year ${formatMoney(data.revenue_this_year)}` : undefined}
        />
        <StatCard
          label="Lifetime revenue"
          icon={IndianRupee}
          loading={!data}
          value={data ? formatMoney(data.revenue_lifetime) : ''}
        />
        <StatCard
          label="Bookings this month"
          icon={CalendarCheck}
          loading={!data}
          value={data?.bookings_this_month ?? ''}
          hint={data ? `${data.bookings_today} today · ${data.bookings_total} all time` : undefined}
        />
        <StatCard
          label="End customers"
          icon={Users}
          loading={!data}
          value={data?.end_customers_total ?? ''}
          hint="People who booked with any business"
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>New customers per month</CardTitle>
            <CardDescription>Businesses that signed up in the last 12 months</CardDescription>
          </CardHeader>
          <CardContent>
            {data ? (
              <>
                <AdminBarChart
                  integer
                  ariaLabel={`Sign-ups per month, ${data.signups_by_month.reduce((s, m) => s + m.signups, 0)} in 12 months`}
                  data={data.signups_by_month.map((m) => ({
                    label: m.label.slice(0, 3),
                    value: m.signups,
                    details: [m.label, `${m.first_payments} first payments`],
                  }))}
                />
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Show as table</summary>
                  <Table className="mt-2">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Month</TableHead>
                        <TableHead className="text-right">Sign-ups</TableHead>
                        <TableHead className="text-right">First payments</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.signups_by_month.map((m) => (
                        <TableRow key={m.month}>
                          <TableCell>{m.label}</TableCell>
                          <TableCell className="text-right tabular-nums">{m.signups}</TableCell>
                          <TableCell className="text-right tabular-nums">{m.first_payments}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </details>
              </>
            ) : (
              <Skeleton className="h-64 sm:h-72" />
            )}
          </CardContent>
        </Card>
        {data ? <StatusBreakdown data={data} /> : <Skeleton className="h-80" />}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="overflow-hidden xl:col-span-2">
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle>Newest customers</CardTitle>
            <Link to="/admin/customers" className="text-sm font-medium text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {data && data.recent_businesses.length > 0 ? (
              <BusinessTable rows={data.recent_businesses} />
            ) : (
              <p className="px-6 pb-6 text-sm text-muted-foreground">{data ? 'No customers yet.' : 'Loading…'}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle>Latest payments</CardTitle>
            <Link to="/admin/payments" className="text-sm font-medium text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {data && data.recent_payments.length > 0 ? (
              <ul className="divide-y divide-border">
                {data.recent_payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{p.business_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(p.paid_at, ADMIN_TZ)} · {p.source === 'manual' ? 'Manual' : 'Razorpay'}
                      </p>
                    </div>
                    <span className="shrink-0 font-medium tabular-nums">{formatMoney(p.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{data ? 'No payments yet.' : 'Loading…'}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
