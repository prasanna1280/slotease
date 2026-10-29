import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { PasswordInput } from '@/components/auth/PasswordInput'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, fieldDescriptionId } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/useAuth'
import { getErrorCode, getErrorMessage } from '@/lib/errors'
import { applyServerFieldErrors, loginSchema, type LoginValues } from '@/lib/validation'

export interface LoginFormProps {
  /** Called after a successful sign-in (e.g. navigate to `next`). */
  onSuccess: () => void
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const { login } = useAuth()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await login({ email: values.email.toLowerCase(), password: values.password })
      onSuccess()
    } catch (err) {
      if (getErrorCode(err) === 'INVALID_CREDENTIALS') {
        setFormError(getErrorMessage(err, 'Incorrect email or password.'))
        return
      }
      if (!applyServerFieldErrors(err, setError, ['email', 'password'])) {
        setFormError(getErrorMessage(err))
      }
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5" aria-label="Sign in">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <Field htmlFor="login-email" label="Email" error={errors.email?.message}>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="you@business.com"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? fieldDescriptionId('login-email') : undefined}
          {...register('email')}
        />
      </Field>

      <div className="flex flex-col gap-1.5">
        <Field htmlFor="login-password" label="Password" error={errors.password?.message}>
          <PasswordInput
            id="login-password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? fieldDescriptionId('login-password') : undefined}
            {...register('password')}
          />
        </Field>
        <div className="flex justify-end">
          <Link
            to="/forgot-password"
            className="inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-primary hover:underline sm:min-h-0 sm:py-1"
          >
            Forgot password?
          </Link>
        </div>
      </div>

      <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
        Sign in
      </Button>
    </form>
  )
}
