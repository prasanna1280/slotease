import { zodResolver } from '@hookform/resolvers/zod'
import { ChevronDown } from 'lucide-react'
import { useState, type ChangeEvent } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { PasswordInput } from '@/components/auth/PasswordInput'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, fieldDescriptionId } from '@/components/ui/field'
import { fieldClasses, Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/useAuth'
import { browserTimezone } from '@/lib/datetime'
import { getErrorCode, getErrorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import {
  applyServerFieldErrors,
  defaultTimezone,
  registerSchema,
  slugify,
  TIMEZONE_OPTIONS,
  type RegisterValues,
} from '@/lib/validation'

const FIELDS = ['business_name', 'slug', 'full_name', 'email', 'phone', 'password', 'timezone'] as const

export interface RegisterFormProps {
  onSuccess: () => void
}

function bookingHost(): string {
  return typeof window !== 'undefined' && window.location.host ? window.location.host : 'slotease.app'
}

export function RegisterForm({ onSuccess }: RegisterFormProps) {
  const { register: registerAccount } = useAuth()
  const [formError, setFormError] = useState<string | null>(null)
  // Until the owner types in the slug field, it follows the business name.
  const [slugEdited, setSlugEdited] = useState(false)

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors, isSubmitting, isSubmitted },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      business_name: '',
      slug: '',
      full_name: '',
      email: '',
      phone: '',
      password: '',
      timezone: defaultTimezone(browserTimezone()),
    },
  })

  const slug = useWatch({ control, name: 'slug' })
  const host = bookingHost()

  const describedBy = (id: string, hasDescription: boolean) => (hasDescription ? fieldDescriptionId(id) : undefined)

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await registerAccount({
        business_name: values.business_name,
        slug: values.slug,
        full_name: values.full_name,
        email: values.email.toLowerCase(),
        phone: values.phone,
        password: values.password,
        timezone: values.timezone,
      })
      onSuccess()
    } catch (err) {
      const code = getErrorCode(err)
      if (code === 'EMAIL_TAKEN') {
        setError('email', { type: 'server', message: 'An account with this email already exists.' }, { shouldFocus: true })
        return
      }
      if (code === 'SLUG_TAKEN') {
        setError('slug', { type: 'server', message: 'This address is already taken. Try another.' }, { shouldFocus: true })
        return
      }
      if (code === 'SLUG_RESERVED') {
        setError('slug', { type: 'server', message: 'This address is reserved. Please choose another.' }, { shouldFocus: true })
        return
      }
      if (!applyServerFieldErrors(err, setError, FIELDS)) setFormError(getErrorMessage(err))
    }
  })

  const businessNameField = register('business_name', {
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      if (!slugEdited) setValue('slug', slugify(e.target.value), { shouldValidate: isSubmitted })
    },
  })

  const slugField = register('slug', {
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      // Clearing the field hands control back to the business name.
      setSlugEdited(e.target.value.trim() !== '')
    },
  })

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5" aria-label="Create your account">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <fieldset className="flex flex-col gap-5">
        <legend className="mb-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Your business
        </legend>

        <Field htmlFor="reg-business" label="Business name" error={errors.business_name?.message}>
          <Input
            id="reg-business"
            autoComplete="organization"
            placeholder="Glow Salon"
            aria-invalid={!!errors.business_name}
            aria-describedby={describedBy('reg-business', !!errors.business_name)}
            {...businessNameField}
          />
        </Field>

        <Field
          htmlFor="reg-slug"
          label="Booking page address"
          error={errors.slug?.message}
          hint={
            <span className="break-all">
              Customers book at{' '}
              <span className="font-medium text-foreground" data-testid="slug-preview">
                {host}/{slug || 'your-business'}
              </span>
            </span>
          }
        >
          <div
            className={cn(
              fieldClasses,
              'h-11 items-center gap-0 p-0 focus-within:border-ring focus-within:outline-2 focus-within:outline-ring/30 sm:h-10',
              errors.slug && 'border-destructive',
            )}
          >
            <span
              className="hidden h-full shrink-0 items-center border-r border-border bg-muted px-3 text-sm text-muted-foreground sm:flex"
              aria-hidden="true"
            >
              {host}/
            </span>
            <input
              id="reg-slug"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="glow-salon"
              className="h-full min-w-0 flex-1 rounded-md bg-transparent px-3 text-base outline-none placeholder:text-muted-foreground sm:text-sm"
              aria-invalid={!!errors.slug}
              aria-describedby={fieldDescriptionId('reg-slug')}
              {...slugField}
            />
          </div>
        </Field>

        <Field htmlFor="reg-timezone" label="Timezone" error={errors.timezone?.message} hint="Used for your working hours and booking times.">
          <div className="relative">
            <select
              id="reg-timezone"
              className={cn(fieldClasses, 'h-11 appearance-none py-2 pr-10 sm:h-10')}
              aria-invalid={!!errors.timezone}
              aria-describedby={fieldDescriptionId('reg-timezone')}
              {...register('timezone')}
            >
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
          </div>
        </Field>
      </fieldset>

      <fieldset className="flex flex-col gap-5 border-t border-border pt-5">
        <legend className="mb-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          About you
        </legend>

        <Field htmlFor="reg-name" label="Full name" error={errors.full_name?.message}>
          <Input
            id="reg-name"
            autoComplete="name"
            placeholder="Asha Kumar"
            aria-invalid={!!errors.full_name}
            aria-describedby={describedBy('reg-name', !!errors.full_name)}
            {...register('full_name')}
          />
        </Field>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field htmlFor="reg-email" label="Work email" error={errors.email?.message}>
            <Input
              id="reg-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="you@business.com"
              aria-invalid={!!errors.email}
              aria-describedby={describedBy('reg-email', !!errors.email)}
              {...register('email')}
            />
          </Field>

          <Field htmlFor="reg-phone" label="Phone" error={errors.phone?.message}>
            <Input
              id="reg-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+91 98765 43210"
              aria-invalid={!!errors.phone}
              aria-describedby={describedBy('reg-phone', !!errors.phone)}
              {...register('phone')}
            />
          </Field>
        </div>

        <Field
          htmlFor="reg-password"
          label="Password"
          error={errors.password?.message}
          hint="At least 8 characters, with a letter and a number."
        >
          <PasswordInput
            id="reg-password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            aria-describedby={fieldDescriptionId('reg-password')}
            {...register('password')}
          />
        </Field>
      </fieldset>

      <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
        Start 14-day free trial
      </Button>

      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        No card required. Cancel anytime during your trial. See how we handle your data in our{' '}
        <Link to="/privacy" target="_blank" rel="noopener" className="font-medium text-primary hover:underline">
          privacy policy
        </Link>
        .
      </p>
    </form>
  )
}
