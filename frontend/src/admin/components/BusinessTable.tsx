import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AdminStatusBadge } from '@/admin/components/AdminStatusBadge'
import { ADMIN_TZ } from '@/admin/format'
import type { BusinessRow } from '@/admin/types'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate } from '@/lib/datetime'
import { formatMoney } from '@/lib/money'

/** Which date column to show: when they joined, or the trial / paid period end. */
export type DateColumn = 'joined' | 'trial_end' | 'period_end'

const DATE_HEADER: Record<DateColumn, string> = { joined: 'Joined', trial_end: 'Trial ends', period_end: 'Period ends' }

function dateFor(row: BusinessRow, column: DateColumn): string {
  const value = column === 'joined' ? row.created_at : column === 'trial_end' ? row.trial_ends_at : row.current_period_end
  return value ? formatDate(value, ADMIN_TZ) : '—'
}

/** Businesses as a table on tablets and up, stacked cards on phones. Rows open the business detail. */
export function BusinessTable({ rows, dateColumn = 'joined' }: { rows: BusinessRow[]; dateColumn?: DateColumn }) {
  return (
    <>
      <ul className="divide-y divide-border md:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              to={`/admin/customers/${row.id}`}
              className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate font-medium text-foreground">{row.name}</p>
                  <AdminStatusBadge status={row.status} />
                </div>
                <p className="truncate text-sm text-muted-foreground">{row.owner_email ?? row.slug}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {row.appointments_count} bookings · {formatMoney(row.revenue_total)} · {DATE_HEADER[dateColumn]}{' '}
                  {dateFor(row, dateColumn)}
                </p>
              </div>
              <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>

      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Business</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Bookings</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead>{DATE_HEADER[dateColumn]}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} className="relative">
                <TableCell className="max-w-56">
                  <Link
                    to={`/admin/customers/${row.id}`}
                    className="block truncate font-medium text-foreground after:absolute after:inset-0 hover:text-primary"
                  >
                    {row.name}
                  </Link>
                  <span className="block truncate text-xs text-muted-foreground">/{row.slug}</span>
                </TableCell>
                <TableCell className="max-w-56">
                  <span className="block truncate">{row.owner_name ?? '—'}</span>
                  <span className="block truncate text-xs text-muted-foreground">{row.owner_email}</span>
                </TableCell>
                <TableCell>
                  <AdminStatusBadge status={row.status} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.appointments_count}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(row.revenue_total)}</TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">{dateFor(row, dateColumn)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
