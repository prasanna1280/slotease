import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatMoney } from '@/lib/money'
import type { TopService } from '@/types/api'

/** Top 5 services by bookings. Compact enough to stay a table at every width. */
export function TopServicesTable({ services, currency }: { services: TopService[]; currency: string }) {
  if (services.length === 0) {
    return <p className="px-4 pb-4 text-sm text-muted-foreground sm:px-6">No services were booked this month.</p>
  }
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-10">#</TableHead>
          <TableHead>Service</TableHead>
          <TableHead className="text-right">Bookings</TableHead>
          <TableHead className="text-right">Revenue</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {services.map((s, i) => (
          <TableRow key={s.service_id}>
            <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
            <TableCell className="font-medium text-foreground">{s.name}</TableCell>
            <TableCell className="text-right tabular-nums">{s.bookings}</TableCell>
            <TableCell className="text-right whitespace-nowrap tabular-nums">{formatMoney(s.revenue, currency)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
