import { Check, Mail, Phone, RotateCcw, UserX, XCircle } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useStatusAction } from '@/components/appointments/useStatusAction'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatDate, formatDuration, formatTimeRange } from '@/lib/datetime'
import { formatMoney } from '@/lib/money'
import type { AppointmentOut, AppointmentStatus } from '@/types/api'

export interface AppointmentDetailDialogProps {
  /** The appointment to show (read from live query data so optimistic changes show immediately). */
  appointment: AppointmentOut | null
  onOpenChange: (open: boolean) => void
  timezone: string
  currency: string
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-3 py-2.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-foreground">{children}</dd>
    </div>
  )
}

export function AppointmentDetailDialog({ appointment, onOpenChange, timezone, currency }: AppointmentDetailDialogProps) {
  const { changeStatus, pendingId } = useStatusAction()
  const [confirmCancel, setConfirmCancel] = useState(false)
  const a = appointment
  const busy = a !== null && pendingId === a.id
  const run = (status: AppointmentStatus) => {
    if (a) changeStatus(a, status)
  }

  return (
    <>
      <Dialog open={a !== null} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          {a && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <DialogTitle>{a.customer_name}</DialogTitle>
                  <StatusBadge status={a.status} />
                </div>
                <DialogDescription className="tabular-nums">
                  {formatDate(a.start_time, timezone)} · {formatTimeRange(a.start_time, a.end_time, timezone)}
                </DialogDescription>
              </DialogHeader>

              <dl className="divide-y divide-border border-y border-border">
                <Row label="Service">
                  {a.service_name}{' '}
                  <span className="text-muted-foreground">({formatDuration(a.duration_min)})</span>
                </Row>
                <Row label="Price">
                  <span className="tabular-nums">{formatMoney(a.price, currency)}</span>
                </Row>
                <Row label="Phone">
                  <a
                    href={`tel:${a.customer_phone}`}
                    className="inline-flex min-h-11 items-center gap-1.5 font-medium text-primary tabular-nums hover:underline sm:min-h-0"
                  >
                    <Phone className="size-4" aria-hidden="true" />
                    {a.customer_phone}
                  </a>
                </Row>
                {a.customer_email && (
                  <Row label="Email">
                    <a
                      href={`mailto:${a.customer_email}`}
                      className="inline-flex items-center gap-1.5 break-all text-primary hover:underline"
                    >
                      <Mail className="size-4 shrink-0" aria-hidden="true" />
                      {a.customer_email}
                    </a>
                  </Row>
                )}
                {a.notes && <Row label="Notes">{a.notes}</Row>}
                <Row label="Reference">
                  <span className="font-mono text-xs">{a.reference ?? `#${a.id}`}</span>
                </Row>
                <Row label="Booked via">{a.source === 'owner' ? 'Owner (manual)' : 'Online booking page'}</Row>
              </dl>

              <Link
                to={`/app/customers/${a.customer_id}`}
                className="text-sm font-medium text-primary hover:underline"
                onClick={() => onOpenChange(false)}
              >
                View customer history
              </Link>

              <DialogFooter className="sm:justify-between">
                {a.status === 'booked' ? (
                  <>
                    <Button variant="ghost" className="text-destructive" disabled={busy} onClick={() => setConfirmCancel(true)}>
                      <XCircle aria-hidden="true" />
                      Cancel appointment
                    </Button>
                    <div className="flex flex-col-reverse gap-2 sm:flex-row">
                      <Button variant="outline" disabled={busy} onClick={() => run('no_show')}>
                        <UserX aria-hidden="true" />
                        No-show
                      </Button>
                      <Button variant="success" disabled={busy} onClick={() => run('completed')}>
                        <Check aria-hidden="true" />
                        Complete
                      </Button>
                    </div>
                  </>
                ) : (
                  <Button variant="outline" className="sm:ml-auto" disabled={busy} onClick={() => run('booked')}>
                    <RotateCcw aria-hidden="true" />
                    {a.status === 'cancelled' ? 'Restore booking' : 'Revert to booked'}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancel this appointment?"
        description="The time slot becomes free for other customers."
        confirmLabel="Cancel appointment"
        cancelLabel="Keep booking"
        variant="destructive"
        onConfirm={() => {
          setConfirmCancel(false)
          run('cancelled')
        }}
      />
    </>
  )
}
