import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { FormCard } from '@/components/settings/FormCard'
import { rulesSchema, rulesToForm, type RulesFormValues } from '@/components/settings/settings-schemas'
import { Field, fieldDescriptionId } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useUpdateBusiness } from '@/hooks/useBusiness'
import { formatDuration } from '@/lib/datetime'
import { getErrorMessage } from '@/lib/errors'
import { applyServerFieldErrors } from '@/lib/validation'
import { SLOT_INTERVALS, type BusinessOut } from '@/types/api'

const FIELDS = ['slot_interval_min', 'booking_window_days', 'min_notice_minutes'] as const

function noticeHint(raw: string): string {
  const n = Number(raw)
  if (!/^\d+$/.test(raw.trim())) return 'In minutes, e.g. 60 for one hour.'
  if (n === 0) return 'Customers can book right up to the start time.'
  const days = Math.floor(n / 1440)
  const rest = n % 1440
  const text = days > 0 ? `${days} day${days === 1 ? '' : 's'}${rest ? ` ${formatDuration(rest)}` : ''}` : formatDuration(n)
  return `= ${text} before the appointment.`
}

export function BookingRulesForm({ business }: { business: BusinessOut }) {
  const update = useUpdateBusiness()
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<RulesFormValues>({ resolver: zodResolver(rulesSchema), defaultValues: rulesToForm(business) })
  const notice = useWatch({ control, name: 'min_notice_minutes' })

  const onSubmit = handleSubmit((v) => {
    update.mutate(
      {
        slot_interval_min: Number(v.slot_interval_min),
        booking_window_days: Number(v.booking_window_days),
        min_notice_minutes: Number(v.min_notice_minutes),
      },
      {
        onSuccess: (saved) => {
          reset(rulesToForm(saved))
          toast.success('Booking rules saved')
        },
        onError: (err) => {
          if (!applyServerFieldErrors(err, setError, FIELDS)) {
            setError('root', { type: 'server', message: getErrorMessage(err, 'Could not save booking rules.') })
          }
        },
      },
    )
  })

  return (
    <FormCard
      title="Booking rules"
      description="Control which times customers see on your booking page. Bookings you add yourself ignore notice and window limits."
      onSubmit={onSubmit}
      pending={update.isPending}
      dirty={isDirty}
      onReset={() => reset(rulesToForm(business))}
      rootError={errors.root?.message}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          htmlFor="rule-interval"
          label="Slot interval"
          error={errors.slot_interval_min?.message}
          hint="How often start times are offered."
        >
          <Controller
            control={control}
            name="slot_interval_min"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger
                  id="rule-interval"
                  ref={field.ref}
                  aria-invalid={!!errors.slot_interval_min}
                  aria-describedby={fieldDescriptionId('rule-interval')}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SLOT_INTERVALS.map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      Every {formatDuration(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field
          htmlFor="rule-window"
          label="Booking window (days)"
          error={errors.booking_window_days?.message}
          hint="How far ahead customers can book (1–365)."
        >
          <Input
            id="rule-window"
            type="number"
            inputMode="numeric"
            min={1}
            max={365}
            aria-invalid={!!errors.booking_window_days}
            aria-describedby={fieldDescriptionId('rule-window')}
            {...register('booking_window_days')}
          />
        </Field>
        <Field
          htmlFor="rule-notice"
          label="Minimum notice (minutes)"
          error={errors.min_notice_minutes?.message}
          hint={noticeHint(notice)}
        >
          <Input
            id="rule-notice"
            type="number"
            inputMode="numeric"
            min={0}
            max={10080}
            step={15}
            aria-invalid={!!errors.min_notice_minutes}
            aria-describedby={fieldDescriptionId('rule-notice')}
            {...register('min_notice_minutes')}
          />
        </Field>
      </div>
    </FormCard>
  )
}
