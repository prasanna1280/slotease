import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { newBookingSchema, type NewBookingValues } from '@/components/appointments/new-booking-schema'
import { zonedDateTimeToIso } from '@/components/appointments/zoned-time'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, fieldDescriptionId } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useCreateAppointment, useOwnerSlots } from '@/hooks/useAppointments'
import { useServices } from '@/hooks/useServices'
import { formatDateTime, formatDuration, formatTime } from '@/lib/datetime'
import { getErrorCode, getErrorMessage } from '@/lib/errors'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { applyServerFieldErrors } from '@/lib/validation'
import type { BusinessOut } from '@/types/api'

export interface NewBookingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  business: BusinessOut
  /** Pre-selected date (YYYY-MM-DD). */
  defaultDate: string
}

const SERVER_FIELDS = ['service_id', 'customer_name', 'customer_phone', 'customer_email', 'notes'] as const

function SlotPicker({
  slug,
  serviceId,
  date,
  timezone,
  value,
  onSelect,
}: {
  slug: string
  serviceId: number | null
  date: string
  timezone: string
  value: string
  onSelect: (iso: string) => void
}) {
  const slots = useOwnerSlots(slug, serviceId, date)

  if (!serviceId) {
    return <p className="text-sm text-muted-foreground">Choose a service to see free slots.</p>
  }
  if (slots.isPending) {
    return (
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" aria-busy="true" aria-label="Loading free slots">
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="h-11 sm:h-9" />
        ))}
      </div>
    )
  }
  if (slots.isError) {
    const inactive = getErrorCode(slots.error) === 'BUSINESS_INACTIVE'
    return (
      <p className="text-sm text-muted-foreground">
        {inactive
          ? 'Slot suggestions are unavailable while online booking is paused. Enter a custom time below.'
          : 'Could not load free slots. Enter a custom time below.'}
      </p>
    )
  }
  if (slots.data.slots.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No free online slots on this day (closed, fully booked or inside the minimum notice). You can still enter a
        custom time.
      </p>
    )
  }
  return (
    <div
      role="group"
      aria-label="Free slots"
      className="grid max-h-48 grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-5"
    >
      {slots.data.slots.map((slot) => {
        const selected = value === slot.start_time
        return (
          <button
            key={slot.start_time}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(selected ? '' : slot.start_time)}
            className={cn(
              'h-11 rounded-md border text-sm font-medium tabular-nums transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-9',
              selected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input bg-card text-foreground hover:border-primary hover:bg-primary-subtle',
            )}
          >
            {formatTime(slot.start_time, timezone)}
          </button>
        )
      })}
    </div>
  )
}

function NewBookingForm({ business, defaultDate, onDone }: { business: BusinessOut; defaultDate: string; onDone: () => void }) {
  const services = useServices(false)
  const create = useCreateAppointment()
  const tz = business.timezone

  const {
    control,
    register,
    handleSubmit,
    setValue,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<NewBookingValues>({
    resolver: zodResolver(newBookingSchema),
    defaultValues: {
      service_id: '',
      date: defaultDate,
      slot: '',
      custom_time: '',
      customer_name: '',
      customer_phone: '',
      customer_email: '',
      notes: '',
    },
  })

  const [serviceIdRaw, date, slot] = useWatch({ control, name: ['service_id', 'date', 'slot'] })
  const serviceId = serviceIdRaw ? Number(serviceIdRaw) : null

  const onSubmit = handleSubmit((values) => {
    const startTime = values.slot || zonedDateTimeToIso(values.date, values.custom_time, tz)
    create.mutate(
      {
        service_id: Number(values.service_id),
        start_time: startTime,
        customer_name: values.customer_name,
        customer_phone: values.customer_phone,
        customer_email: values.customer_email || null,
        notes: values.notes || null,
      },
      {
        onSuccess: (appt) => {
          toast.success('Booking created', {
            description: `${appt.customer_name} · ${formatDateTime(appt.start_time, tz)}`,
          })
          onDone()
        },
        onError: (err) => {
          const code = getErrorCode(err)
          if (code === 'SLOT_TAKEN') {
            setValue('slot', '')
            setError('custom_time', { type: 'server', message: 'That time was just booked. Pick another time.' })
            toast.error('That time was just booked.')
          } else if (code === 'INVALID_SLOT') {
            setError('custom_time', { type: 'server', message: getErrorMessage(err) })
          } else if (code === 'SERVICE_NOT_FOUND') {
            setError('service_id', { type: 'server', message: 'This service is no longer available.' })
          } else if (!applyServerFieldErrors(err, setError, SERVER_FIELDS)) {
            setError('root', { type: 'server', message: getErrorMessage(err, 'Could not create the booking.') })
          }
        },
      },
    )
  })

  if (services.isSuccess && services.data.length === 0) {
    return (
      <Alert variant="info">
        <AlertDescription>
          Add at least one active service before creating bookings.{' '}
          <Link to="/app/services" className="font-semibold underline underline-offset-4" onClick={onDone}>
            Go to Services
          </Link>
        </AlertDescription>
      </Alert>
    )
  }

  const timeError = errors.custom_time?.message

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {errors.root?.message && (
        <Alert variant="destructive">
          <AlertDescription>{errors.root.message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-[1fr_11rem]">
        <Field htmlFor="nb-service" label="Service" error={errors.service_id?.message}>
          <Controller
            control={control}
            name="service_id"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(v) => {
                  field.onChange(v)
                  setValue('slot', '')
                }}
                disabled={services.isPending}
              >
                <SelectTrigger
                  id="nb-service"
                  ref={field.ref}
                  aria-invalid={!!errors.service_id}
                  aria-describedby={fieldDescriptionId('nb-service')}
                >
                  <SelectValue placeholder={services.isPending ? 'Loading services…' : 'Choose a service'} />
                </SelectTrigger>
                <SelectContent>
                  {services.data?.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name} · {formatDuration(s.duration_min)} · {formatMoney(s.price, business.currency)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field htmlFor="nb-date" label="Date" error={errors.date?.message}>
          <Input
            id="nb-date"
            type="date"
            aria-invalid={!!errors.date}
            {...register('date', { onChange: () => setValue('slot', '') })}
          />
        </Field>
      </div>

      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-medium text-foreground">Time</legend>
        <SlotPicker
          slug={business.slug}
          serviceId={serviceId}
          date={date}
          timezone={tz}
          value={slot}
          onSelect={(iso) => {
            setValue('slot', iso)
            if (iso) setValue('custom_time', '')
            clearErrors('custom_time')
          }}
        />
        <Field
          htmlFor="nb-custom-time"
          label="Custom time"
          optional
          error={timeError}
          hint="Owner bookings may use any time within working hours, even if it is not offered online."
          className="max-w-xs"
        >
          <Input
            id="nb-custom-time"
            type="time"
            step={300}
            aria-invalid={!!timeError}
            aria-describedby={fieldDescriptionId('nb-custom-time')}
            {...register('custom_time', {
              onChange: (e: { target: { value: string } }) => {
                if (e.target.value) setValue('slot', '')
              },
            })}
          />
        </Field>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field htmlFor="nb-name" label="Customer name" error={errors.customer_name?.message}>
          <Input
            id="nb-name"
            autoComplete="off"
            aria-invalid={!!errors.customer_name}
            aria-describedby={fieldDescriptionId('nb-name')}
            {...register('customer_name')}
          />
        </Field>
        <Field htmlFor="nb-phone" label="Phone" error={errors.customer_phone?.message}>
          <Input
            id="nb-phone"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            aria-invalid={!!errors.customer_phone}
            aria-describedby={fieldDescriptionId('nb-phone')}
            {...register('customer_phone')}
          />
        </Field>
        <Field htmlFor="nb-email" label="Email" optional error={errors.customer_email?.message}>
          <Input
            id="nb-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            aria-invalid={!!errors.customer_email}
            aria-describedby={fieldDescriptionId('nb-email')}
            {...register('customer_email')}
          />
        </Field>
        <Field htmlFor="nb-notes" label="Notes" optional error={errors.notes?.message} className="sm:col-span-2">
          <Textarea id="nb-notes" rows={2} aria-invalid={!!errors.notes} {...register('notes')} />
        </Field>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={create.isPending}>
          Cancel
        </Button>
        <Button type="submit" loading={create.isPending}>
          Create booking
        </Button>
      </DialogFooter>
    </form>
  )
}

/** Owner booking dialog: suggested free slots plus a free-form custom time. */
export function NewBookingDialog({ open, onOpenChange, business, defaultDate }: NewBookingDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New booking</DialogTitle>
          <DialogDescription>
            Book a walk-in or phone customer. Times are in {business.timezone}.
          </DialogDescription>
        </DialogHeader>
        {/* Content unmounts when closed, so the form starts fresh each time. */}
        <NewBookingForm business={business} defaultDate={defaultDate} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}
