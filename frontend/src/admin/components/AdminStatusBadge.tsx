import { ADMIN_STATUS_LABEL, ADMIN_STATUS_VARIANT } from '@/admin/format'
import type { AdminStatus } from '@/admin/types'
import { Badge } from '@/components/ui/badge'

export function AdminStatusBadge({ status, className }: { status: AdminStatus; className?: string }) {
  return (
    <Badge variant={ADMIN_STATUS_VARIANT[status]} className={className}>
      {ADMIN_STATUS_LABEL[status]}
    </Badge>
  )
}
