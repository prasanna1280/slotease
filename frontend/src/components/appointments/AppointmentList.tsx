import { Phone } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AppointmentActions } from '@/components/appointments/AppointmentActions'
import { useStatusAction } from '@/components/appointments/useStatusAction'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDuration, formatTime } from '@/lib/datetime'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { AppointmentOut } from '@/types/api'

export interface AppointmentListProps {
  appointments: AppointmentOut[] | undefined
  timezone: string
  currency: string
  loading?: boolean
  /** Rendered when the list is loaded and empty. */
  empty: ReactNode
}

function LoadingRows() {
  return (
    <Card className="divide-y divide-border" aria-busy="true" aria-label="Loading appointments">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4">
          <Skeleton className="h-5 w-16" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="hidden h-8 w-40 md:block" />
        </div>
      ))}
    </Card>
  )
}

function CustomerCell({ appointment }: { appointment: AppointmentOut }) {
  return (
    <div className="min-w-0">
      <Link
        to={`/app/customers/${appointment.customer_id}`}
        className="block truncate font-medium text-foreground hover:text-primary hover:underline"
      >
        {appointment.customer_name}
      </Link>
      <a
        href={`tel:${appointment.customer_phone}`}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums hover:text-primary"
      >
        <Phone className="size-3" aria-hidden="true" />
        {appointment.customer_phone}
      </a>
    </div>
  )
}

/** Day appointment list: table at `md+`, stacked cards below. Status actions are optimistic. */
export function AppointmentList({ appointments, timezone, currency, loading, empty }: AppointmentListProps) {
  const { changeStatus, pendingId } = useStatusAction()

  if (loading || !appointments) return <LoadingRows />
  if (appointments.length === 0) return <>{empty}</>

  const dimmed = (a: AppointmentOut) => a.status === 'cancelled'

  return (
    <>
      {/* md+: table */}
      <Card className="hidden overflow-hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-36">Time</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {appointments.map((a) => (
              <TableRow key={a.id} className={cn(dimmed(a) && 'text-muted-foreground')}>
                <TableCell className="align-top">
                  <p className="font-medium text-foreground tabular-nums">{formatTime(a.start_time, timezone)}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    to {formatTime(a.end_time, timezone)}
                  </p>
                </TableCell>
                <TableCell className="max-w-56 align-top">
                  <CustomerCell appointment={a} />
                </TableCell>
                <TableCell className="align-top">
                  <p className={cn('text-foreground', dimmed(a) && 'line-through decoration-slate-400')}>
                    {a.service_name}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatDuration(a.duration_min)} · {formatMoney(a.price, currency)}
                  </p>
                </TableCell>
                <TableCell className="align-top">
                  <StatusBadge status={a.status} />
                </TableCell>
                <TableCell className="py-2">
                  <AppointmentActions
                    appointment={a}
                    disabled={pendingId === a.id}
                    onChangeStatus={(status) => changeStatus(a, status)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* < md: cards */}
      <ul className="space-y-3 md:hidden" aria-label="Appointments">
        {appointments.map((a) => (
          <li key={a.id}>
            <Card className={cn('p-4', dimmed(a) && 'bg-muted/40')}>
              <div className="flex items-start gap-3">
                <div className="w-16 shrink-0">
                  <p className="text-sm font-semibold text-foreground tabular-nums">
                    {formatTime(a.start_time, timezone)}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDuration(a.duration_min)}</p>
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <CustomerCell appointment={a} />
                    <StatusBadge status={a.status} />
                  </div>
                  <p className="truncate text-sm text-slate-700">
                    {a.service_name}
                    <span className="text-muted-foreground"> · {formatMoney(a.price, currency)}</span>
                  </p>
                </div>
              </div>
              <AppointmentActions
                appointment={a}
                fullWidth
                className="mt-3 border-t border-border pt-3"
                disabled={pendingId === a.id}
                onChangeStatus={(status) => changeStatus(a, status)}
              />
            </Card>
          </li>
        ))}
      </ul>
    </>
  )
}
