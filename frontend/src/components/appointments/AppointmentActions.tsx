import { Check, MoreHorizontal, Phone, RotateCcw, UserRound, UserX, XCircle } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { AppointmentOut, AppointmentStatus } from '@/types/api'

export interface AppointmentActionsProps {
  appointment: AppointmentOut
  onChangeStatus: (status: AppointmentStatus) => void
  /** Disable the buttons while a change for this appointment is in flight. */
  disabled?: boolean
  /** Stretch the primary buttons (mobile cards). */
  fullWidth?: boolean
  className?: string
}

/**
 * One-click Complete / No-show for booked appointments, plus an overflow menu with
 * Cancel (confirmed), Revert / Restore to booked, call and view customer.
 */
export function AppointmentActions({
  appointment,
  onChangeStatus,
  disabled = false,
  fullWidth = false,
  className,
}: AppointmentActionsProps) {
  const navigate = useNavigate()
  const [confirmCancel, setConfirmCancel] = useState(false)
  const { status, customer_name: name } = appointment
  const isBooked = status === 'booked'

  return (
    <div className={cn('flex items-center gap-2', fullWidth ? 'w-full' : 'justify-end', className)}>
      {isBooked && (
        <>
          <Button
            size="sm"
            variant="outline"
            className={cn(fullWidth && 'flex-1')}
            disabled={disabled}
            onClick={() => onChangeStatus('completed')}
            aria-label={`Mark ${name} as completed`}
          >
            <Check className="text-success" aria-hidden="true" />
            Complete
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={cn(fullWidth && 'flex-1')}
            disabled={disabled}
            onClick={() => onChangeStatus('no_show')}
            aria-label={`Mark ${name} as no-show`}
          >
            <UserX className="text-warning" aria-hidden="true" />
            No-show
          </Button>
        </>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" disabled={disabled} aria-label={`More actions for ${name}`}>
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {(status === 'completed' || status === 'no_show') && (
            <DropdownMenuItem onSelect={() => onChangeStatus('booked')}>
              <RotateCcw aria-hidden="true" />
              Revert to booked
            </DropdownMenuItem>
          )}
          {status === 'cancelled' && (
            <DropdownMenuItem onSelect={() => onChangeStatus('booked')}>
              <RotateCcw aria-hidden="true" />
              Restore booking
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <a href={`tel:${appointment.customer_phone}`}>
              <Phone aria-hidden="true" />
              Call {appointment.customer_phone}
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate(`/app/customers/${appointment.customer_id}`)}>
            <UserRound aria-hidden="true" />
            View customer
          </DropdownMenuItem>
          {isBooked && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmCancel(true)}>
                <XCircle aria-hidden="true" />
                Cancel appointment
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancel this appointment?"
        description={`${name}'s booking will be cancelled and the time slot becomes free for others.`}
        confirmLabel="Cancel appointment"
        cancelLabel="Keep booking"
        variant="destructive"
        onConfirm={() => {
          setConfirmCancel(false)
          onChangeStatus('cancelled')
        }}
      />
    </div>
  )
}
