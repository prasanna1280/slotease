import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { FormCard } from '@/components/settings/FormCard'
import {
  businessFormToUpdate,
  businessSchema,
  businessToForm,
  type BusinessFormValues,
} from '@/components/settings/settings-schemas'
import { Field, fieldDescriptionId } from '@/components/ui/field'
import { fieldClasses, Input } from '@/components/ui/input'
import { useUpdateBusiness } from '@/hooks/useBusiness'
import { getErrorCode, getErrorMessage } from '@/lib/errors'
import { bookingUrl, cn } from '@/lib/utils'
import { applyServerFieldErrors, TIMEZONE_OPTIONS } from '@/lib/validation'
import type { BusinessOut } from '@/types/api'

const FIELDS = ['name', 'phone', 'email', 'address', 'timezone', 'slug'] as const

export function BusinessSettingsForm({ business }: { business: BusinessOut }) {
  const update = useUpdateBusiness()
  const {
    register,
    handleSubmit,
    reset,
    setError,
    control,
    formState: { errors, isDirty },
  } = useForm<BusinessFormValues>({
    resolver: zodResolver(businessSchema),
    defaultValues: businessToForm(business),
  })
  const slug = useWatch({ control, name: 'slug' })
  const slugChanged = slug.trim().toLowerCase() !== business.slug

  const timezones = TIMEZONE_OPTIONS.some((o) => o.value === business.timezone)
    ? TIMEZONE_OPTIONS
    : [{ value: business.timezone, label: business.timezone }, ...TIMEZONE_OPTIONS]

  const onSubmit = handleSubmit((values) => {
    update.mutate(businessFormToUpdate(values), {
      onSuccess: (saved) => {
        reset(businessToForm(saved))
        toast.success('Business details saved', {
          description: saved.slug !== business.slug ? `Your booking link is now ${bookingUrl(saved.slug)}` : undefined,
        })
      },
      onError: (err) => {
        const code = getErrorCode(err)
        if (code === 'SLUG_TAKEN') {
          setError('slug', { type: 'server', message: 'This address is already taken. Try another.' }, { shouldFocus: true })
        } else if (code === 'SLUG_RESERVED') {
          setError('slug', { type: 'server', message: getErrorMessage(err) }, { shouldFocus: true })
        } else if (!applyServerFieldErrors(err, setError, FIELDS)) {
          setError('root', { type: 'server', message: getErrorMessage(err, 'Could not save business details.') })
        }
      },
    })
  })

  return (
    <FormCard
      title="Business details"
      description="Shown on your booking page and in confirmation emails."
      onSubmit={onSubmit}
      pending={update.isPending}
      dirty={isDirty}
      onReset={() => reset(businessToForm(business))}
      rootError={errors.root?.message}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field htmlFor="biz-name" label="Business name" error={errors.name?.message} className="sm:col-span-2">
          <Input id="biz-name" autoComplete="organization" aria-invalid={!!errors.name} aria-describedby={fieldDescriptionId('biz-name')} {...register('name')} />
        </Field>
        <Field htmlFor="biz-phone" label="Phone" error={errors.phone?.message}>
          <Input id="biz-phone" type="tel" inputMode="tel" autoComplete="tel" aria-invalid={!!errors.phone} aria-describedby={fieldDescriptionId('biz-phone')} {...register('phone')} />
        </Field>
        <Field htmlFor="biz-email" label="Contact email" optional error={errors.email?.message} hint="Booking notifications go here.">
          <Input id="biz-email" type="email" inputMode="email" autoComplete="email" aria-invalid={!!errors.email} aria-describedby={fieldDescriptionId('biz-email')} {...register('email')} />
        </Field>
        <Field htmlFor="biz-address" label="Address" optional error={errors.address?.message} className="sm:col-span-2">
          <Input id="biz-address" autoComplete="street-address" aria-invalid={!!errors.address} aria-describedby={fieldDescriptionId('biz-address')} {...register('address')} />
        </Field>
        <Field htmlFor="biz-timezone" label="Timezone" error={errors.timezone?.message} hint="All times on your booking page and dashboard use this timezone.">
          <select
            id="biz-timezone"
            className={cn(fieldClasses, 'h-11 py-2 sm:h-10')}
            aria-invalid={!!errors.timezone}
            aria-describedby={fieldDescriptionId('biz-timezone')}
            {...register('timezone')}
          >
            {timezones.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          htmlFor="biz-slug"
          label="Booking page address"
          error={errors.slug?.message}
          hint={
            slugChanged ? (
              <span className="text-warning">
                Changing this changes your booking link. Old links and QR codes will stop working.
              </span>
            ) : (
              <span className="break-all">{bookingUrl(business.slug)}</span>
            )
          }
        >
          <Input
            id="biz-slug"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={!!errors.slug}
            aria-describedby={fieldDescriptionId('biz-slug')}
            {...register('slug')}
          />
        </Field>
      </div>
    </FormCard>
  )
}
