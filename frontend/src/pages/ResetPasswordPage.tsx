import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { AuthCard } from '@/components/auth/AuthCard'
import { PasswordInput } from '@/components/auth/PasswordInput'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, fieldDescriptionId } from '@/components/ui/field'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { getErrorCode, getErrorMessage } from '@/lib/errors'
import { applyServerFieldErrors, resetPasswordSchema, type ResetPasswordValues } from '@/lib/validation'
import { authService } from '@/services/authService'

const signInLink = (
  <Link to="/login" className="font-medium text-primary hover:underline">
    Back to sign in
  </Link>
)

function InvalidLink() {
  return (
    <AuthCard title="Reset link not valid" footer={signInLink}>
      <div className="flex flex-col gap-5">
        <Alert variant="warning">
          <AlertTitle>This link is invalid or has expired</AlertTitle>
          <AlertDescription>
            Reset links can be used once and expire after 30 minutes. Request a new one to continue.
          </AlertDescription>
        </Alert>
        <Button asChild size="lg" className="w-full">
          <Link to="/forgot-password">Request a new link</Link>
        </Button>
      </div>
    </AuthCard>
  )
}

export default function ResetPasswordPage() {
  useDocumentTitle('Choose a new password')
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token')?.trim() ?? ''
  const [tokenInvalid, setTokenInvalid] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirm: '' },
  })

  const onSubmit = handleSubmit(async ({ password }) => {
    setFormError(null)
    try {
      await authService.resetPassword({ token, new_password: password })
      toast.success('Password updated', { description: 'Sign in with your new password.' })
      navigate('/login', { replace: true })
    } catch (err) {
      if (getErrorCode(err) === 'INVALID_TOKEN') {
        setTokenInvalid(true)
        return
      }
      if (!applyServerFieldErrors(err, setError, ['password'], { new_password: 'password' })) {
        setFormError(getErrorMessage(err))
      }
    }
  })

  if (!token || tokenInvalid) return <InvalidLink />

  return (
    <AuthCard
      title="Choose a new password"
      description="You will be signed out on all other devices."
      footer={signInLink}
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5" aria-label="Set a new password">
        {formError && (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}
        <Field
          htmlFor="reset-password"
          label="New password"
          error={errors.password?.message}
          hint="At least 8 characters, with a letter and a number."
        >
          <PasswordInput
            id="reset-password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            aria-describedby={fieldDescriptionId('reset-password')}
            {...register('password')}
          />
        </Field>
        <Field htmlFor="reset-confirm" label="Confirm new password" error={errors.confirm?.message}>
          <PasswordInput
            id="reset-confirm"
            autoComplete="new-password"
            aria-invalid={!!errors.confirm}
            aria-describedby={errors.confirm ? fieldDescriptionId('reset-confirm') : undefined}
            {...register('confirm')}
          />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Update password
        </Button>
      </form>
    </AuthCard>
  )
}
