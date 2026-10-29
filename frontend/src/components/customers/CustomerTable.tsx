import { ChevronRight } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate } from '@/lib/datetime'
import type { CustomerOut } from '@/types/api'

export interface CustomerTableProps {
  customers: CustomerOut[]
  timezone: string
}

function lastVisit(c: CustomerOut, tz: string): string {
  return c.last_visit ? formatDate(c.last_visit, tz) : 'Never'
}

/** Customers: table at md+, tappable cards below. */
export function CustomerTable({ customers, timezone }: CustomerTableProps) {
  const navigate = useNavigate()

  return (
    <>
      <Card className="hidden overflow-hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead className="text-right">Bookings</TableHead>
              <TableHead className="text-right">Visits</TableHead>
              <TableHead className="text-right">No-shows</TableHead>
              <TableHead>Last visit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.map((c) => (
              <TableRow
                key={c.id}
                className="cursor-pointer"
                onClick={() => navigate(`/app/customers/${c.id}`)}
              >
                <TableCell className="max-w-64">
                  <Link
                    to={`/app/customers/${c.id}`}
                    className="block truncate font-medium text-foreground hover:text-primary hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {c.name}
                  </Link>
                  {c.email && <p className="truncate text-xs text-muted-foreground">{c.email}</p>}
                </TableCell>
                <TableCell className="text-slate-700 tabular-nums">{c.phone}</TableCell>
                <TableCell className="text-right tabular-nums">{c.total_bookings}</TableCell>
                <TableCell className="text-right tabular-nums">{c.completed_visits}</TableCell>
                <TableCell className="text-right tabular-nums">
                  <span className={c.no_shows > 0 ? 'font-medium text-warning' : undefined}>{c.no_shows}</span>
                </TableCell>
                <TableCell className="whitespace-nowrap text-slate-700 tabular-nums">{lastVisit(c, timezone)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <ul className="space-y-2 md:hidden" aria-label="Customers">
        {customers.map((c) => (
          <li key={c.id}>
            <Link
              to={`/app/customers/${c.id}`}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-sm transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{c.name}</p>
                <p className="text-sm text-muted-foreground tabular-nums">{c.phone}</p>
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  {c.total_bookings} bookings · {c.completed_visits} visits
                  {c.no_shows > 0 && <span className="text-warning"> · {c.no_shows} no-shows</span>} · Last:{' '}
                  {lastVisit(c, timezone)}
                </p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
