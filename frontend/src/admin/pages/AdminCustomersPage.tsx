import { Building2, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BusinessTable } from '@/admin/components/BusinessTable'
import { ADMIN_STATUS_LABEL, ADMIN_STATUSES } from '@/admin/format'
import { useAdminBusinesses } from '@/admin/hooks'
import type { AdminStatus, BusinessListParams } from '@/admin/types'
import { QueryErrorAlert } from '@/components/dashboard/QueryErrorAlert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 25
const ALL = 'all'

function isStatus(v: string | null): v is AdminStatus {
  return ADMIN_STATUSES.includes(v as AdminStatus)
}

export default function AdminCustomersPage() {
  useDocumentTitle('Customers')
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const statusParam = params.get('status')
  const status = isStatus(statusParam) ? statusParam : undefined
  const sortParam = params.get('sort')
  const sort: NonNullable<BusinessListParams['sort']> = sortParam === 'oldest' || sortParam === 'name' ? sortParam : 'newest'
  const page = Math.max(1, Number(params.get('page')) || 1)
  const [search, setSearch] = useState(q)

  const setParam = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next, { replace: true })
  }

  // Debounce typing into the URL (which drives the query).
  useEffect(() => {
    if (search.trim() === q) return
    const id = window.setTimeout(() => setParam({ q: search.trim() || undefined }), 300)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the typed text
  }, [search])

  const list = useAdminBusinesses({ q: q || undefined, status, sort, page, page_size: PAGE_SIZE })
  const data = list.data
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <div className="space-y-6">
      <PageHeader title="Customers" description="Every business using SlotEase. Open one to manage it." />

      <div className="flex flex-col gap-3 md:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, booking page, phone or owner email"
            aria-label="Search customers"
            className="pl-9"
          />
        </div>
        <Select value={status ?? ALL} onValueChange={(v) => setParam({ status: v === ALL ? undefined : v })}>
          <SelectTrigger className="w-full md:w-48" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {ADMIN_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {ADMIN_STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setParam({ sort: v === 'newest' ? undefined : v })}>
          <SelectTrigger className="w-full md:w-40" aria-label="Sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="name">Name A–Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {list.isError && (
        <QueryErrorAlert title="Could not load customers" error={list.error} onRetry={() => void list.refetch()} retrying={list.isFetching} />
      )}

      <Card className={cn('overflow-hidden', list.isFetching && data && 'opacity-70 transition-opacity')}>
        {!data ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={Building2}
            title={q || status ? 'No customers match' : 'No customers yet'}
            description={q || status ? 'Try another search or status.' : 'Businesses appear here when they sign up.'}
          />
        ) : (
          <BusinessTable rows={data.items} />
        )}
      </Card>

      {data && data.total > 0 && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-3 text-sm">
          <p className="text-muted-foreground tabular-nums">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)} of {data.total}
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
