import { toast } from 'sonner'
import { useUpdateAppointmentStatus } from '@/hooks/useAppointments'
import { getErrorCode, getErrorMessage } from '@/lib/errors'
import type { AppointmentOut, AppointmentStatus } from '@/types/api'

const SUCCESS_MESSAGE: Record<AppointmentStatus, string> = {
  completed: 'Marked as completed',
  no_show: 'Marked as no-show',
  cancelled: 'Appointment cancelled',
  booked: 'Appointment restored to booked',
}

/** Status change with optimistic UI and toasts. Shared by the Today list and the calendar dialog. */
export function useStatusAction() {
  const mutation = useUpdateAppointmentStatus()

  const changeStatus = (appointment: AppointmentOut, status: AppointmentStatus, onDone?: () => void) => {
    mutation.mutate(
      { id: appointment.id, status },
      {
        onSuccess: () => {
          toast.success(SUCCESS_MESSAGE[status], { description: appointment.customer_name })
          onDone?.()
        },
        onError: (err) => {
          const message =
            getErrorCode(err) === 'SLOT_TAKEN'
              ? 'That time now has another booking, so this appointment cannot be restored.'
              : getErrorMessage(err, 'Could not update the appointment.')
          toast.error(message)
          onDone?.()
        },
      },
    )
  }

  return {
    changeStatus,
    isPending: mutation.isPending,
    pendingId: mutation.isPending ? mutation.variables?.id : undefined,
  }
}
