import { IndianRupee } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { ADMIN_TZ } from '@/admin/format'
import { useAdminPayments } from '@/admin/hooks'
import type { PaymentListParams } from '@/admin/types'
import { QueryErrorAlert } from '@/components/dashboard/QueryErrorAlert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatDate } from '@/lib/datetime'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 50
const ALL = 'all'

export default function AdminPaymentsPage() {
  useDocumentTitle('Payments')
  const [params, setParams] = useSearchParams()
  const source = params.get('source') === 'manual' || params.get('source') === 'razorpay' ? (params.get('source') as PaymentListParams['source']) : undefined
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const page = Math.max(1, Number(params.get('page')) || 1)

  const setParam = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next, { replace: true })
  }

  const query = useAdminPayments({ source, from: from || undefined, to: to || undefined, page, page_size: PAGE_SIZE })
  const data = query.data
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description={data ? `${data.total} payments · ${formatMoney(data.total_amount)} in total for this filter` : 'Every payment received.'}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Field htmlFor="pay-from" label="From">
          <Input id="pay-from" type="date" value={from} max={to || undefined} onChange={(e) => setParam({ from: e.target.value || undefined })} />
        </Field>
        <Field htmlFor="pay-to" label="To">
          <Input id="pay-to" type="date" value={to} min={from || undefined} onChange={(e) => setParam({ to: e.target.value || undefined })} />
        </Field>
        <Field htmlFor="pay-source" label="Source">
          <Select value={source ?? ALL} onValueChange={(v) => setParam({ source: v === ALL ? undefined : v })}>
            <SelectTrigger id="pay-source">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All sources</SelectItem>
              <SelectItem value="razorpay">Razorpay</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      {query.isError && (
        <QueryErrorAlert title="Could not load payments" error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
      )}

      <Card className={cn('overflow-hidden', query.isFetching && data && 'opacity-70 transition-opacity')}>
        {!data ? (
          <Skeleton className="m-6 h-40" />
        ) : data.items.length === 0 ? (
          <EmptyState icon={IndianRupee} title="No payments" description="Payments appear when Razorpay charges a customer or you record one." />
        ) : (
          <>
            <ul className="divide-y divide-border md:hidden">
              {data.items.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{p.business_name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatDate(p.paid_at, ADMIN_TZ)} · {p.source === 'manual' ? 'Manual' : 'Razorpay'}
                    </p>
                  </div>
                  <span className="shrink-0 font-medium tabular-nums">{formatMoney(p.amount)}</span>
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date (IST)</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Reference / note</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="whitespace-nowrap tabular-nums">{formatDate(p.paid_at, ADMIN_TZ)}</TableCell>
                      <TableCell className="max-w-56">
                        {p.business_id ? (
                          <Link to={`/admin/customers/${p.business_id}`} className="block truncate font-medium hover:text-primary">
                            {p.business_name}
                          </Link>
                        ) : (
                          <span className="block truncate text-muted-foreground">{p.business_name} (deleted)</span>
                        )}
                      </TableCell>
                      <TableCell>{p.source === 'manual' ? 'Manual' : 'Razorpay'}</TableCell>
                      <TableCell className="max-w-64 truncate text-muted-foreground">
                        {p.note ?? p.provider_payment_id ?? '—'}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatMoney(p.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </Card>

      {data && data.total > PAGE_SIZE && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-3 text-sm">
          <p className="text-muted-foreground tabular-nums">
            Page {page} of {pages}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setParam({ page: String(page - 1) })}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setParam({ page: String(page + 1) })}>
              Next
            </Button>
          </div>
        </nav>
      )}
    </div>
  )
}
