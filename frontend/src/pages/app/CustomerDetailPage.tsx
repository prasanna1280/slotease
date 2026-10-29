import { ArrowLeft, CalendarCheck, CalendarX2, CircleCheck, Clock, Mail, Phone, UserX } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { AppointmentActions } from '@/components/appointments/AppointmentActions'
import { useStatusAction } from '@/components/appointments/useStatusAction'
import { QueryErrorAlert } from '@/components/dashboard/QueryErrorAlert'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { StatCard } from '@/components/ui/stat-card'
import { StatusBadge } from '@/components/ui/status-badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useCurrentBusiness } from '@/hooks/useAuth'
import { useCustomer } from '@/hooks/useCustomers'
import { formatDate, formatTime } from '@/lib/datetime'
import { getErrorStatus } from '@/lib/errors'
import { formatMoney } from '@/lib/money'

function BackLink() {
  return (
    <Link to="/app/customers" className="inline-flex min-h-11 items-center gap-1 hover:text-foreground sm:min-h-0">
      <ArrowLeft className="size-4" aria-hidden="true" />
      Customers
    </Link>
  )
}

export default function CustomerDetailPage() {
  const business = useCurrentBusiness()
  const tz = business.timezone
  const { id } = useParams()
  const customerId = Number(id)
  const customer = useCustomer(customerId)
  const { changeStatus, pendingId } = useStatusAction()

  if (!Number.isInteger(customerId) || customerId <= 0 || getErrorStatus(customer.error) === 404) {
    return (
      <>
        <PageHeader eyebrow={<BackLink />} title="Customer not found" />
        <EmptyState
          title="This customer does not exist"
          description="They may belong to another business or the link is wrong."
          action={
            <Button asChild variant="outline">
              <Link to="/app/customers">Back to customers</Link>
            </Button>
          }
        />
      </>
    )
  }

  if (customer.isError) {
    return (
      <>
        <PageHeader eyebrow={<BackLink />} title="Customer" />
        <QueryErrorAlert
          title="Could not load this customer"
          error={customer.error}
          onRetry={() => void customer.refetch()}
          retrying={customer.isFetching}
        />
      </>
    )
  }

  if (customer.isPending) {
    return (
      <div aria-busy="true" aria-label="Loading customer">
        <Skeleton className="mb-2 h-4 w-24" />
        <Skeleton className="mb-6 h-8 w-56" />
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  const c = customer.data

  return (
    <>
      <PageHeader
        eyebrow={<BackLink />}
        title={c.name}
        description={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <a href={`tel:${c.phone}`} className="inline-flex min-h-11 items-center gap-1.5 text-primary tabular-nums hover:underline sm:min-h-0">
              <Phone className="size-4" aria-hidden="true" />
              {c.phone}
            </a>
            {c.email && (
              <a href={`mailto:${c.email}`} className="inline-flex min-h-11 items-center gap-1.5 break-all text-primary hover:underline sm:min-h-0">
                <Mail className="size-4" aria-hidden="true" />
                {c.email}
              </a>
            )}
            <span>Customer since {formatDate(c.created_at, tz)}</span>
          </span>
        }
        actions={
          <Button asChild variant="outline">
            <a href={`tel:${c.phone}`}>
              <Phone aria-hidden="true" />
              Call
            </a>
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatCard label="Total bookings" icon={CalendarCheck} tone="primary" value={c.total_bookings} />
        <StatCard label="Completed visits" icon={CircleCheck} tone="success" value={c.completed_visits} />
        <StatCard label="No-shows" icon={UserX} tone="warning" value={c.no_shows} />
        <StatCard
          label="Last visit"
          icon={Clock}
          value={<span className="text-lg">{c.last_visit ? formatDate(c.last_visit, tz) : 'Never'}</span>}
        />
      </div>

      <Card>
        <CardHeader className="pb-3 sm:pb-4">
          <CardTitle>Appointment history</CardTitle>
          <p className="text-sm text-muted-foreground">Latest 50, newest first.</p>
        </CardHeader>
        {c.appointments.length === 0 ? (
          <EmptyState bare icon={CalendarX2} title="No appointments yet" />
        ) : (
          <>
            <div className="hidden border-t border-border md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Date</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.appointments.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        <span className="font-medium text-foreground">{formatDate(a.start_time, tz)}</span>
                        <span className="text-muted-foreground"> · {formatTime(a.start_time, tz)}</span>
                      </TableCell>
                      <TableCell>{a.service_name}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(a.price, business.currency)}</TableCell>
                      <TableCell>
                        <StatusBadge status={a.status} />
                      </TableCell>
                      <TableCell className="py-2">
                        <AppointmentActions
                          appointment={a}
                          disabled={pendingId === a.id}
                          onChangeStatus={(s) => changeStatus(a, s)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="divide-y divide-border border-t border-border md:hidden">
              {c.appointments.map((a) => (
                <li key={a.id} className="space-y-1 px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-foreground tabular-nums">
                      {formatDate(a.start_time, tz)} · {formatTime(a.start_time, tz)}
                    </p>
                    <StatusBadge status={a.status} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {a.service_name} · <span className="tabular-nums">{formatMoney(a.price, business.currency)}</span>
                  </p>
                  <AppointmentActions
                    appointment={a}
                    fullWidth
                    className="pt-2"
                    disabled={pendingId === a.id}
                    onChangeStatus={(s) => changeStatus(a, s)}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </>
  )
}
