import { zodResolver } from '@hookform/resolvers/zod'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { useAdminAuth } from '@/admin/admin-auth-context'
import { adminService } from '@/admin/api'
import type { AdminLoginOut } from '@/admin/types'
import { AuthCard } from '@/components/auth/AuthCard'
import { PasswordInput } from '@/components/auth/PasswordInput'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, fieldDescriptionId } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { getErrorCode, getErrorMessage } from '@/lib/errors'

const credentialsSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email.').email('Enter a valid email.'),
  password: z.string().min(1, 'Enter your password.'),
})
type Credentials = z.infer<typeof credentialsSchema>

const codeSchema = z.object({
  code: z
    .string()
    .transform((v) => v.replace(/\s/g, ''))
    .refine((v) => /^\d{6}$/.test(v), 'Enter the 6-digit code.'),
})
type CodeValues = z.input<typeof codeSchema>

function safeAdminNext(next: string | null): string {
  return next && next.startsWith('/admin') && !next.startsWith('//') ? next : '/admin'
}

function CredentialsStep({ onChallenge }: { onChallenge: (c: AdminLoginOut) => void }) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Credentials>({ resolver: zodResolver(credentialsSchema), defaultValues: { email: '', password: '' } })

  const onSubmit = handleSubmit(async (values) => {
    try {
      onChallenge(await adminService.login(values.email, values.password))
    } catch (err) {
      setError('root', {
        type: 'server',
        message:
          getErrorCode(err) === 'INVALID_CREDENTIALS'
            ? 'Email or password is incorrect.'
            : getErrorMessage(err, 'Could not sign in.'),
      })
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {errors.root?.message && (
        <Alert variant="destructive">
          <AlertDescription>{errors.root.message}</AlertDescription>
        </Alert>
      )}
      <Field htmlFor="admin-email" label="Email" error={errors.email?.message}>
        <Input
          id="admin-email"
          type="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={!!errors.email}
          aria-describedby={fieldDescriptionId('admin-email')}
          {...register('email')}
        />
      </Field>
      <Field htmlFor="admin-password" label="Password" error={errors.password?.message}>
        <PasswordInput
          id="admin-password"
          autoComplete="current-password"
          aria-invalid={!!errors.password}
          aria-describedby={fieldDescriptionId('admin-password')}
          {...register('password')}
        />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
        Continue
      </Button>
    </form>
  )
}

function SetupInstructions({ secret, uri }: { secret: string; uri: string }) {
  const [qr, setQr] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(uri, { margin: 1, width: 200 })
      .then((url) => {
        if (!cancelled) setQr(url)
      })
      .catch(() => {
        if (!cancelled) setQr(null)
      })
    return () => {
      cancelled = true
    }
  }, [uri])

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4 text-sm">
      <p className="font-medium text-foreground">Set up two-step sign-in</p>
      <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
        <li>Open an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…).</li>
        <li>Scan this QR code, or enter the setup key by hand.</li>
        <li>Type the 6-digit code it shows below.</li>
      </ol>
      <div className="flex justify-center">
        {qr ? (
          <img src={qr} alt="QR code for your authenticator app" width={200} height={200} className="rounded-md bg-white" />
        ) : (
          <div className="size-[200px] rounded-md bg-muted" aria-hidden="true" />
        )}
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Setup key</p>
        <p className="font-mono text-sm break-all text-foreground select-all">{secret.replace(/(.{4})/g, '$1 ').trim()}</p>
      </div>
    </div>
  )
}

function CodeStep({ challenge, onBack }: { challenge: AdminLoginOut; onBack: () => void }) {
  const { startSession } = useAdminAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CodeValues, unknown, z.output<typeof codeSchema>>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: '' },
  })

  const onSubmit = handleSubmit(async ({ code }) => {
    try {
      startSession(await adminService.verify(challenge.challenge_token, code))
      navigate(safeAdminNext(params.get('next')), { replace: true })
    } catch (err) {
      const errorCode = getErrorCode(err)
      if (errorCode === 'INVALID_CODE') {
        setError('code', { type: 'server', message: 'That code is not valid. Try the newest code.' }, { shouldFocus: true })
      } else if (errorCode === 'INVALID_TOKEN') {
        setError('root', { type: 'server', message: 'This sign-in took too long. Start again.' })
      } else {
        setError('root', { type: 'server', message: getErrorMessage(err, 'Could not verify the code.') })
      }
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {challenge.step === 'setup' && challenge.secret && challenge.otpauth_uri && (
        <SetupInstructions secret={challenge.secret} uri={challenge.otpauth_uri} />
      )}
      {errors.root?.message && (
        <Alert variant="destructive">
          <AlertDescription>{errors.root.message}</AlertDescription>
        </Alert>
      )}
      <Field
        htmlFor="admin-code"
        label="Authenticator code"
        error={errors.code?.message}
        hint={challenge.step === 'totp' ? 'Open your authenticator app and enter the current code.' : undefined}
      >
        <Input
          id="admin-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          autoFocus
          className="font-mono tracking-[0.3em]"
          aria-invalid={!!errors.code}
          aria-describedby={fieldDescriptionId('admin-code')}
          {...register('code')}
        />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
        {challenge.step === 'setup' ? 'Turn on and sign in' : 'Sign in'}
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={onBack}>
        Use a different account
      </Button>
    </form>
  )
}

export default function AdminLoginPage() {
  useDocumentTitle('Admin sign in')
  const { admin, isLoading } = useAdminAuth()
  const [params] = useSearchParams()
  const [challenge, setChallenge] = useState<AdminLoginOut | null>(null)

  if (!isLoading && admin) return <Navigate to={safeAdminNext(params.get('next'))} replace />

  return (
    <AuthCard
      title="SlotEase admin"
      description={challenge ? 'Step 2 of 2 · Two-step verification' : 'Staff sign in. Step 1 of 2.'}
      footer="Restricted to SlotEase staff. Every action is recorded."
    >
      {challenge ? (
        <CodeStep challenge={challenge} onBack={() => setChallenge(null)} />
      ) : (
        <CredentialsStep onChallenge={setChallenge} />
      )}
    </AuthCard>
  )
}
