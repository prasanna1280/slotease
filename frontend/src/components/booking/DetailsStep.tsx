import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { StepHeading } from '@/components/booking/BookingStepper'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, fieldDescriptionId } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { formatDayLabel, formatTime } from '@/lib/datetime'
import { getErrorMessage } from '@/lib/errors'
import { applyServerFieldErrors, bookingDetailsSchema, type BookingDetailsValues } from '@/lib/validation'

export const DETAILS_FORM_ID = 'booking-details-form'

const FIELDS = ['customer_name', 'customer_phone', 'customer_email', 'notes'] as const

export interface DetailsStepProps {
  defaultValues: BookingDetailsValues
  /** Whether the defaults came from a previous booking on this device. */
  remembered: boolean
  onForget: () => void
  slotStart: string
  timezone: string
  onChangeTime: () => void
  /** Resolves on success; rejects with the API error for field / generic errors. */
  onSubmit: (values: BookingDetailsValues) => Promise<void>
  focusOnMount: boolean
}

export function DetailsStep({
  defaultValues,
  remembered,
  onForget,
  slotStart,
  timezone,
  onChangeTime,
  onSubmit,
  focusOnMount,
}: DetailsStepProps) {
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<BookingDetailsValues>({
    resolver: zodResolver(bookingDetailsSchema),
    defaultValues,
  })

  const submit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await onSubmit(values)
    } catch (err) {
      if (!applyServerFieldErrors(err, setError, FIELDS)) {
        setFormError(getErrorMessage(err, 'We could not complete your booking. Please try again.'))
      }
    }
  })

  const describedBy = (id: string, has: boolean) => (has ? fieldDescriptionId(id) : undefined)

  return (
    <section aria-labelledby="step-details-title">
      <StepHeading
        id="step-details-title"
        title="Your details"
        description={
          <span className="tabular-nums">
            {formatDayLabel(slotStart, timezone)} at {formatTime(slotStart, timezone)}
          </span>
        }
        focusOnMount={focusOnMount}
        action={
          <Button variant="ghost" size="sm" onClick={onChangeTime} className="-mr-2 text-primary">
            Change
            <span className="sr-only"> date and time</span>
          </Button>
        }
      />

      <form id={DETAILS_FORM_ID} onSubmit={submit} noValidate className="flex flex-col gap-5">
        {formError && (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        {remembered && (
          <p className="-mt-1 flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
            We filled in your details from your last booking.
            <button
              type="button"
              className="inline-flex min-h-11 items-center rounded-sm font-medium text-primary hover:underline sm:min-h-0"
              onClick={() => {
                onForget()
                reset({ customer_name: '', customer_phone: '', customer_email: '', notes: '' })
              }}
            >
              Not you?
            </button>
          </p>
        )}

        <Field htmlFor="customer-name" label="Full name" error={errors.customer_name?.message}>
          <Input
            id="customer-name"
            autoComplete="name"
            enterKeyHint="next"
            aria-invalid={!!errors.customer_name}
            aria-describedby={describedBy('customer-name', !!errors.customer_name)}
            {...register('customer_name')}
          />
        </Field>

        <Field
          htmlFor="customer-phone"
          label="Mobile number"
          error={errors.customer_phone?.message}
          hint="We'll only use this about your appointment."
        >
          <Input
            id="customer-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            enterKeyHint="next"
            placeholder="+91 98765 43210"
            aria-invalid={!!errors.customer_phone}
            aria-describedby={fieldDescriptionId('customer-phone')}
            {...register('customer_phone')}
          />
        </Field>

        <Field
          htmlFor="customer-email"
          label="Email"
          optional
          error={errors.customer_email?.message}
          hint="For your confirmation email."
        >
          <Input
            id="customer-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={!!errors.customer_email}
            aria-describedby={fieldDescriptionId('customer-email')}
            {...register('customer_email')}
          />
        </Field>

        <Field htmlFor="customer-notes" label="Notes for the business" optional error={errors.notes?.message}>
          <Textarea
            id="customer-notes"
            rows={3}
            maxLength={500}
            placeholder="Anything they should know before your visit"
            aria-invalid={!!errors.notes}
            aria-describedby={describedBy('customer-notes', !!errors.notes)}
            {...register('notes')}
          />
        </Field>

        <p className="text-xs leading-relaxed text-muted-foreground">
          Your details are shared with this business to manage your appointment. Read our{' '}
          <Link to="/privacy" target="_blank" rel="noopener" className="font-medium text-primary hover:underline">
            privacy policy
          </Link>
          .
        </p>
      </form>
    </section>
  )
}
