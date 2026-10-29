import { MoreHorizontal, Pencil, Power, PowerOff } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDuration } from '@/lib/datetime'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { ServiceOut } from '@/types/api'

export interface ServiceListProps {
  services: ServiceOut[]
  currency: string
  onEdit: (service: ServiceOut) => void
  onDeactivate: (service: ServiceOut) => void
  onReactivate: (service: ServiceOut) => void
}

function StatusPill({ active }: { active: boolean }) {
  return <Badge variant={active ? 'success' : 'neutral'}>{active ? 'Active' : 'Inactive'}</Badge>
}

function RowMenu({ service, onEdit, onDeactivate, onReactivate }: Omit<ServiceListProps, 'services' | 'currency'> & { service: ServiceOut }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${service.name}`}>
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => onEdit(service)}>
          <Pencil aria-hidden="true" />
          Edit
        </DropdownMenuItem>
        {service.is_active ? (
          <DropdownMenuItem variant="destructive" onSelect={() => onDeactivate(service)}>
            <PowerOff aria-hidden="true" />
            Deactivate
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => onReactivate(service)}>
            <Power aria-hidden="true" />
            Reactivate
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ServiceList({ services, currency, ...actions }: ServiceListProps) {
  return (
    <>
      <Card className="hidden overflow-hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Service</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.map((s) => (
              <TableRow key={s.id} className={cn(!s.is_active && 'text-muted-foreground')}>
                <TableCell className="max-w-md">
                  <p className={cn('font-medium', s.is_active ? 'text-foreground' : 'text-muted-foreground')}>{s.name}</p>
                  {s.description && <p className="line-clamp-1 text-xs text-muted-foreground">{s.description}</p>}
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">{formatDuration(s.duration_min)}</TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">{formatMoney(s.price, currency)}</TableCell>
                <TableCell>
                  <StatusPill active={s.is_active} />
                </TableCell>
                <TableCell className="py-2">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="outline" size="sm" onClick={() => actions.onEdit(s)} aria-label={`Edit ${s.name}`}>
                      <Pencil aria-hidden="true" />
                      Edit
                    </Button>
                    <RowMenu service={s} {...actions} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <ul className="space-y-2 md:hidden" aria-label="Services">
        {services.map((s) => (
          <li key={s.id}>
            <Card className={cn('flex items-start gap-3 p-4', !s.is_active && 'bg-muted/40')}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-foreground">{s.name}</p>
                  {!s.is_active && <StatusPill active={false} />}
                </div>
                <p className="text-sm text-muted-foreground tabular-nums">
                  {formatDuration(s.duration_min)} · {formatMoney(s.price, currency)}
                </p>
                {s.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{s.description}</p>}
              </div>
              <RowMenu service={s} {...actions} />
            </Card>
          </li>
        ))}
      </ul>
    </>
  )
}
