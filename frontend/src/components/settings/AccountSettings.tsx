import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { FormCard } from '@/components/settings/FormCard'
import {
  changePasswordSchema,
  profileSchema,
  type ChangePasswordFormValues,
  type ProfileFormValues,
} from '@/components/settings/settings-schemas'
import { Field, fieldDescriptionId } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/useAuth'
import { useChangePassword, useUpdateAccount } from '@/hooks/useBusiness'
import { getErrorCode, getErrorMessage } from '@/lib/errors'
import { applyServerFieldErrors } from '@/lib/validation'
import type { UserOut } from '@/types/api'

function ProfileForm({ user }: { user: UserOut }) {
  const update = useUpdateAccount()
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<ProfileFormValues>({ resolver: zodResolver(profileSchema), defaultValues: { full_name: user.full_name } })

  const onSubmit = handleSubmit((v) => {
    update.mutate(
      { full_name: v.full_name.trim() },
      {
        onSuccess: (saved) => {
          reset({ full_name: saved.full_name })
          toast.success('Profile updated')
        },
        onError: (err) => {
          if (!applyServerFieldErrors(err, setError, ['full_name'])) {
            setError('root', { type: 'server', message: getErrorMessage(err, 'Could not update your profile.') })
          }
        },
      },
    )
  })

  return (
    <FormCard
      title="Profile"
      onSubmit={onSubmit}
      pending={update.isPending}
      dirty={isDirty}
      onReset={() => reset({ full_name: user.full_name })}
      rootError={errors.root?.message}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field htmlFor="acc-name" label="Full name" error={errors.full_name?.message}>
          <Input id="acc-name" autoComplete="name" aria-invalid={!!errors.full_name} aria-describedby={fieldDescriptionId('acc-name')} {...register('full_name')} />
        </Field>
        <Field htmlFor="acc-email" label="Email" hint="Used to sign in. Contact support to change it.">
          <Input id="acc-email" type="email" value={user.email} readOnly disabled aria-describedby={fieldDescriptionId('acc-email')} />
        </Field>
      </div>
    </FormCard>
  )
}

const EMPTY_PASSWORDS: ChangePasswordFormValues = { current_password: '', new_password: '', confirm: '' }

function ChangePasswordForm() {
  const change = useChangePassword()
  const { logout } = useAuth()
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<ChangePasswordFormValues>({ resolver: zodResolver(changePasswordSchema), defaultValues: EMPTY_PASSWORDS })

  const onSubmit = handleSubmit((v) => {
    change.mutate(
      { current_password: v.current_password, new_password: v.new_password },
      {
        onSuccess: () => {
          // The server revokes every refresh token, so sign in again with the new password.
          toast.success('Password changed', { description: 'Please sign in again with your new password.' })
          void logout().then(() => navigate('/login', { replace: true }))
        },
        onError: (err) => {
          if (getErrorCode(err) === 'INVALID_PASSWORD') {
            setError('current_password', { type: 'server', message: 'Current password is incorrect.' }, { shouldFocus: true })
          } else if (!applyServerFieldErrors(err, setError, ['current_password', 'new_password'])) {
            setError('root', { type: 'server', message: getErrorMessage(err, 'Could not change your password.') })
          }
        },
      },
    )
  })

  return (
    <FormCard
      title="Change password"
      description="At least 8 characters with a letter and a number. You will be signed out of all devices."
      onSubmit={onSubmit}
      submitLabel="Change password"
      pending={change.isPending}
      dirty={isDirty}
      onReset={() => reset(EMPTY_PASSWORDS)}
      rootError={errors.root?.message}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field htmlFor="pw-current" label="Current password" error={errors.current_password?.message} className="sm:col-span-2 sm:max-w-sm">
          <Input id="pw-current" type="password" autoComplete="current-password" aria-invalid={!!errors.current_password} aria-describedby={fieldDescriptionId('pw-current')} {...register('current_password')} />
        </Field>
        <Field htmlFor="pw-new" label="New password" error={errors.new_password?.message}>
          <Input id="pw-new" type="password" autoComplete="new-password" aria-invalid={!!errors.new_password} aria-describedby={fieldDescriptionId('pw-new')} {...register('new_password')} />
        </Field>
        <Field htmlFor="pw-confirm" label="Confirm new password" error={errors.confirm?.message}>
          <Input id="pw-confirm" type="password" autoComplete="new-password" aria-invalid={!!errors.confirm} aria-describedby={fieldDescriptionId('pw-confirm')} {...register('confirm')} />
        </Field>
      </div>
    </FormCard>
  )
}

export function AccountSettings({ user }: { user: UserOut }) {
  return (
    <div className="space-y-6">
      <ProfileForm user={user} />
      <ChangePasswordForm />
    </div>
  )
}
