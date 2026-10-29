import { ScrollText } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { ADMIN_TZ } from '@/admin/format'
import { useAdminAudit } from '@/admin/hooks'
import type { AuditEntry } from '@/admin/types'
import { QueryErrorAlert } from '@/components/dashboard/QueryErrorAlert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatDateTime } from '@/lib/datetime'

const PAGE_SIZE = 50

function Changes({ details }: { details: Record<string, unknown> }) {
  const entries = Object.entries(details)
  if (entries.length === 0) return null
  return (
    <details className="mt-1 text-xs">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Details</summary>
      <dl className="mt-1 space-y-1 rounded-md bg-muted/50 p-2">
        {entries.map(([key, value]) => {
          const change = value as { from?: unknown; to?: unknown } | null
          const isChange = change !== null && typeof change === 'object' && 'to' in change
          return (
            <div key={key} className="break-all">
              <dt className="inline font-medium text-foreground">{key}: </dt>
              <dd className="inline font-mono text-muted-foreground">
                {isChange ? `${JSON.stringify(change.from)} → ${JSON.stringify(change.to)}` : JSON.stringify(value)}
              </dd>
            </div>
          )
        })}
      </dl>
    </details>
  )
}

function Entry({ entry }: { entry: AuditEntry }) {
  return (
    <li className="px-4 py-3 sm:px-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="text-sm text-foreground">
            {entry.business_id ? (
              <Link to={`/admin/customers/${entry.business_id}`} className="hover:text-primary">
                {entry.summary}
              </Link>
            ) : (
              entry.summary
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {entry.admin_email} · <span className="font-mono">{entry.action}</span>
            {entry.ip_address ? ` · ${entry.ip_address}` : ''}
          </p>
          <Changes details={entry.details} />
        </div>
        <time dateTime={entry.created_at} className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {formatDateTime(entry.created_at, ADMIN_TZ)}
        </time>
      </div>
    </li>
  )
}

export default function AdminAuditPage() {
  useDocumentTitle('Audit log')
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number(params.get('page')) || 1)
  const query = useAdminAudit(page)
  const data = query.data
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1
  const go = (p: number) => setParams(p > 1 ? { page: String(p) } : {}, { replace: true })

  return (
    <div className="space-y-6">
      <PageHeader title="Audit log" description="Every admin sign-in and change, newest first. Entries cannot be edited." />
      {query.isError && (
        <QueryErrorAlert title="Could not load the audit log" error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
      )}
      <Card className="overflow-hidden">
        {!data ? (
          <Skeleton className="m-6 h-40" />
        ) : data.items.length === 0 ? (
          <EmptyState icon={ScrollText} title="Nothing recorded yet" />
        ) : (
          <ol className="divide-y divide-border">
            {data.items.map((e) => (
              <Entry key={e.id} entry={e} />
            ))}
          </ol>
        )}
      </Card>
      {data && data.total > PAGE_SIZE && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-3 text-sm">
          <p className="text-muted-foreground tabular-nums">
            Page {page} of {pages}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => go(page - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => go(page + 1)}>
              Next
            </Button>
          </div>
        </nav>
      )}
    </div>
  )
}
