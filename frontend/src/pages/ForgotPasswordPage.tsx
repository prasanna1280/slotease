import { zodResolver } from '@hookform/resolvers/zod'
import { MailCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { AuthCard } from '@/components/auth/AuthCard'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, fieldDescriptionId } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { getErrorMessage, getErrorStatus } from '@/lib/errors'
import { forgotPasswordSchema, type ForgotPasswordValues } from '@/lib/validation'
import { authService } from '@/services/authService'

const backToSignIn = (
  <Link to="/login" className="font-medium text-primary hover:underline">
    Back to sign in
  </Link>
)

export default function ForgotPasswordPage() {
  useDocumentTitle('Reset your password')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })

  const onSubmit = handleSubmit(async ({ email }) => {
    setFormError(null)
    try {
      await authService.forgotPassword(email.toLowerCase())
      setSentTo(email)
    } catch (err) {
      const status = getErrorStatus(err)
      // Only a dropped connection or a rate limit is surfaced. Any other answer shows the same
      // success message so the page never reveals whether an account exists.
      if (status === undefined || status === 429) {
        setFormError(getErrorMessage(err))
        return
      }
      setSentTo(email)
    }
  })

  if (sentTo) {
    return (
      <AuthCard title="Check your email" footer={backToSignIn}>
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary-subtle">
            <MailCheck className="size-6 text-primary" aria-hidden="true" />
          </div>
          <p role="status" className="text-sm leading-relaxed text-muted-foreground">
            If an account exists for <span className="font-medium break-all text-foreground">{sentTo}</span>, we have
            sent a link to reset your password. The link expires in 30 minutes.
          </p>
          <Button variant="outline" className="w-full" onClick={() => setSentTo(null)}>
            Use a different email
          </Button>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Forgot your password?"
      description="Enter the email you signed up with and we will send you a reset link."
      footer={backToSignIn}
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5" aria-label="Request a password reset">
        {formError && (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}
        <Field htmlFor="forgot-email" label="Email" error={errors.email?.message}>
          <Input
            id="forgot-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@business.com"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? fieldDescriptionId('forgot-email') : undefined}
            {...register('email')}
          />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Send reset link
        </Button>
      </form>
    </AuthCard>
  )
}
