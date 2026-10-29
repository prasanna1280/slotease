import { Download } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { AdminBarChart } from '@/admin/components/AdminBarChart'
import { formatChange } from '@/admin/format'
import { useAdminRevenue } from '@/admin/hooks'
import type { Basis, Granularity, RevenueReport } from '@/admin/types'
import { QueryErrorAlert } from '@/components/dashboard/QueryErrorAlert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { StatCard } from '@/components/ui/stat-card'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatMoney, toNumber } from '@/lib/money'
import { cn } from '@/lib/utils'

const GRANULARITIES: { value: Granularity; label: string; noun: string }[] = [
  { value: 'month', label: 'Monthly', noun: 'months' },
  { value: 'quarter', label: 'Quarterly', noun: 'quarters' },
  { value: 'half_year', label: 'Half-yearly', noun: 'half-years' },
  { value: 'year', label: 'Yearly', noun: 'years' },
]

function isGranularity(v: string | null): v is Granularity {
  return GRANULARITIES.some((g) => g.value === v)
}

function shortMoney(value: number): string {
  if (value >= 10_000_000) return `₹${(value / 10_000_000).toFixed(1)}Cr`
  if (value >= 100_000) return `₹${(value / 100_000).toFixed(1)}L`
  if (value >= 1_000) return `₹${(value / 1_000).toFixed(1)}k`
  return `₹${value}`
}

function downloadCsv(report: RevenueReport) {
  const header = ['Period', 'Start', 'End', 'Revenue (INR)', 'Payments', 'Paying customers', 'New paying customers', 'Change %']
  const rows = report.periods.map((p) => [
    p.label,
    p.start,
    p.end,
    p.revenue,
    String(p.payments),
    String(p.paying_businesses),
    String(p.new_paying_businesses),
    p.change_pct === null ? '' : String(p.change_pct),
  ])
  const csv = [header, ...rows].map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `slotease-revenue-${report.granularity}-${report.basis}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export default function AdminRevenuePage() {
  useDocumentTitle('Revenue')
  const [params, setParams] = useSearchParams()
  const granularity: Granularity = isGranularity(params.get('by')) ? (params.get('by') as Granularity) : 'month'
  const basis: Basis = params.get('basis') === 'fiscal' ? 'fiscal' : 'calendar'
  const report = useAdminRevenue(granularity, basis)
  const data = report.data
  const meta = GRANULARITIES.find((g) => g.value === granularity) ?? GRANULARITIES[0]
  const best = data?.periods.reduce<RevenueReport['periods'][number] | null>(
    (top, p) => (!top || toNumber(p.revenue) > toNumber(top.revenue) ? p : top),
    null,
  )

  const update = (next: Record<string, string>) => setParams({ by: granularity, basis, ...next }, { replace: true })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Revenue"
        description="Payments received from customers (Razorpay and manually recorded), by period."
        actions={
          <Button variant="outline" onClick={() => data && downloadCsv(data)} disabled={!data}>
            <Download aria-hidden="true" />
            Download CSV
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={granularity} onValueChange={(v) => update({ by: v })}>
          <TabsList aria-label="Report period" className="w-full sm:w-auto">
            {GRANULARITIES.map((g) => (
              <TabsTrigger key={g.value} value={g.value} className="flex-1 sm:flex-none">
                {g.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Select value={basis} onValueChange={(v) => update({ basis: v })} disabled={granularity === 'month'}>
          <SelectTrigger className="w-full sm:w-64" aria-label="Year type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="calendar">Calendar year (Jan–Dec)</SelectItem>
            <SelectItem value="fiscal">Financial year (Apr–Mar)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {report.isError && (
        <QueryErrorAlert
          title="Could not load revenue"
          error={report.error}
          onRetry={() => void report.refetch()}
          retrying={report.isFetching}
        />
      )}

      <section aria-label="Totals" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label={`Total, last ${data?.periods.length ?? ''} ${meta.noun}`}
          loading={!data}
          value={data ? formatMoney(data.total_revenue) : ''}
          hint={data ? `${data.total_payments} payments` : undefined}
        />
        <StatCard label={`Average per ${meta.noun.replace(/s$/, '')}`} loading={!data} value={data ? formatMoney(data.average_revenue) : ''} />
        <StatCard
          label="Best period"
          loading={!data}
          value={best && toNumber(best.revenue) > 0 ? formatMoney(best.revenue) : '—'}
          hint={best && toNumber(best.revenue) > 0 ? best.label : 'No revenue yet'}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{meta.label} revenue</CardTitle>
          <CardDescription>Amounts in INR. Periods use India time (IST).</CardDescription>
        </CardHeader>
        <CardContent className={cn(report.isFetching && 'opacity-70 transition-opacity')}>
          {data ? (
            <AdminBarChart
              ariaLabel={`${meta.label} revenue bar chart, total ${formatMoney(data.total_revenue)}`}
              formatValue={(v) => formatMoney(v)}
              formatAxis={shortMoney}
              data={data.periods.map((p) => ({
                label: p.label,
                value: toNumber(p.revenue),
                details: [`${p.payments} payments · ${p.paying_businesses} paying`, `Change ${formatChange(p.change_pct)}`],
              }))}
            />
          ) : (
            <Skeleton className="h-64 sm:h-72" />
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Payments</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Paying</TableHead>
                  <TableHead className="hidden text-right md:table-cell">New paying</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...data.periods].reverse().map((p) => (
                  <TableRow key={p.key}>
                    <TableCell className="whitespace-nowrap font-medium">{p.label}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(p.revenue)}</TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums',
                        p.change_pct !== null && p.change_pct > 0 && 'text-green-700',
                        p.change_pct !== null && p.change_pct < 0 && 'text-red-700',
                      )}
                    >
                      {formatChange(p.change_pct)}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{p.payments}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">{p.paying_businesses}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">{p.new_paying_businesses}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(data.total_revenue)}</TableCell>
                  <TableCell />
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{data.total_payments}</TableCell>
                  <TableCell className="hidden md:table-cell" />
                  <TableCell className="hidden md:table-cell" />
                </TableRow>
              </TableFooter>
            </Table>
          ) : (
            <Skeleton className="m-6 h-40" />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
