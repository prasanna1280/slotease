import { CalendarSearch, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useAdminAppointments, useUpdateAppointmentStatus } from '@/admin/hooks'
import type { AdminAppointment } from '@/admin/types'
import { QueryErrorAlert } from '@/components/dashboard/QueryErrorAlert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { APPOINTMENT_STATUS_LABEL, StatusBadge } from '@/components/ui/status-badge'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatDateTime } from '@/lib/datetime'
import { getErrorCode, getErrorMessage } from '@/lib/errors'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { AppointmentStatus } from '@/types/api'

const STATUSES: AppointmentStatus[] = ['booked', 'completed', 'no_show', 'cancelled']
const ALL = 'all'

function isStatus(v: string | null): v is AppointmentStatus {
  return STATUSES.includes(v as AppointmentStatus)
}

function StatusChanger({ appointment }: { appointment: AdminAppointment }) {
  const update = useUpdateAppointmentStatus()
  return (
    <Select
      value={appointment.status}
      disabled={update.isPending}
      onValueChange={(value) =>
        update.mutate(
          { id: appointment.id, status: value as AppointmentStatus },
          {
            onSuccess: () => toast.success(`Marked ${APPOINTMENT_STATUS_LABEL[value as AppointmentStatus].toLowerCase()}`),
            onError: (err) =>
              toast.error(
                getErrorCode(err) === 'SLOT_TAKEN'
                  ? 'That time is now taken by another booking, so it cannot be re-booked.'
                  : getErrorMessage(err, 'Could not change the booking.'),
              ),
          },
        )
      }
    >
      <SelectTrigger className="h-11 w-full sm:h-9 sm:w-36" aria-label={`Status of booking ${appointment.reference ?? appointment.id}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {APPOINTMENT_STATUS_LABEL[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export default function AdminBookingsPage() {
  useDocumentTitle('Bookings')
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const status = isStatus(params.get('status')) ? (params.get('status') as AppointmentStatus) : undefined
  const businessId = Number(params.get('business_id')) || undefined
  const [search, setSearch] = useState(q)

  const setParam = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    setParams(next, { replace: true })
  }

  useEffect(() => {
    if (search.trim() === q) return
    const id = window.setTimeout(() => setParam({ q: search.trim() || undefined }), 300)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the typed text
  }, [search])

  const query = useAdminAppointments({ q: q || undefined, status, business_id: businessId })
  const rows = query.data

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bookings"
        description="Find any booking across all customers by booking ID, customer phone or name, and fix its status."
      />

      <div className="flex flex-col gap-3 md:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="APT-20261010-0007, 98765 43210 or a name"
            aria-label="Search bookings"
            className="pl-9"
          />
        </div>
        <Select value={status ?? ALL} onValueChange={(v) => setParam({ status: v === ALL ? undefined : v })}>
          <SelectTrigger className="w-full md:w-44" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {APPOINTMENT_STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {businessId && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          Showing one customer's bookings.
          <Button variant="link" size="sm" onClick={() => setParam({ business_id: undefined })}>
            Show all customers
          </Button>
        </p>
      )}

      {query.isError && (
        <QueryErrorAlert title="Could not load bookings" error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
      )}

      <Card className={cn('overflow-hidden', query.isFetching && rows && 'opacity-70 transition-opacity')}>
        {!rows ? (
          <Skeleton className="m-6 h-40" />
        ) : rows.length === 0 ? (
          <EmptyState icon={CalendarSearch} title="No bookings found" description="Try a booking ID, the customer's phone number or name." />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((a) => (
              <li key={a.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{a.reference ?? `#${a.id}`}</span>
                    <StatusBadge status={a.status} />
                  </div>
                  <p className="truncate text-sm font-medium text-foreground">
                    {a.customer_name} · {a.customer_phone}
                  </p>
                  <p className="truncate text-sm text-muted-foreground tabular-nums">
                    {formatDateTime(a.start_time, a.business_timezone)} · {a.service_name} · {formatMoney(a.price)} ·{' '}
                    <Link to={`/admin/customers/${a.business_id}`} className="text-primary hover:underline">
                      {a.business_name}
                    </Link>
                  </p>
                  {a.notes && <p className="truncate text-xs text-muted-foreground">Note: {a.notes}</p>}
                </div>
                <StatusChanger appointment={a} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      {rows && rows.length >= 50 && <p className="text-sm text-muted-foreground">Showing the newest 50. Search to narrow it down.</p>}
    </div>
  )
}
