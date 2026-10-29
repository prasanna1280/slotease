import { zodResolver } from '@hookform/resolvers/zod'
import { Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { deleteAccountSchema, type DeleteAccountFormValues } from '@/components/settings/settings-schemas'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { useAuth } from '@/hooks/useAuth'
import { useDeleteBusiness } from '@/hooks/useBusiness'
import { getErrorCode, getErrorMessage } from '@/lib/errors'
import type { BusinessOut } from '@/types/api'

const EMPTY: DeleteAccountFormValues = { password: '', confirm: '' }

function DeleteAccountDialog({
  business,
  open,
  onOpenChange,
}: {
  business: BusinessOut
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const remove = useDeleteBusiness()
  const { logout } = useAuth()
  const navigate = useNavigate()
  const schema = useMemo(() => deleteAccountSchema(business.slug), [business.slug])
  const {
    register,
    handleSubmit,
    reset,
    setError,
    control,
    formState: { errors },
  } = useForm<DeleteAccountFormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY })
  const confirm = useWatch({ control, name: 'confirm' })
  const confirmed = confirm.trim().toLowerCase() === business.slug
  const hasSubscription = business.subscription_status === 'active' || business.subscription_status === 'past_due'

  const close = (next: boolean) => {
    if (remove.isPending) return
    if (!next) reset(EMPTY)
    onOpenChange(next)
  }

  const onSubmit = handleSubmit((values) => {
    remove.mutate(values, {
      onSuccess: () => {
        toast.success('Your account has been deleted', {
          description: `${business.name} and all of its data were permanently removed.`,
        })
        // The account and its sessions are gone; clear the local session and leave the app.
        void logout().then(() => navigate('/', { replace: true }))
      },
      onError: (err) => {
        const code = getErrorCode(err)
        if (code === 'INVALID_PASSWORD') {
          setError('password', { type: 'server', message: 'Password is incorrect.' }, { shouldFocus: true })
        } else if (code === 'CONFIRMATION_MISMATCH') {
          setError('confirm', { type: 'server', message: `Type ${business.slug} to confirm.` }, { shouldFocus: true })
        } else if (code === 'PAYMENT_PROVIDER_ERROR') {
          setError('root', {
            type: 'server',
            message: 'We could not cancel your subscription with Razorpay, so nothing was deleted. Please try again.',
          })
        } else {
          setError('root', { type: 'server', message: getErrorMessage(err, 'Could not delete your account.') })
        }
      },
    })
  })

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg" role="alertdialog">
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <DialogHeader>
            <DialogTitle>Delete {business.name}?</DialogTitle>
            <DialogDescription>
              This permanently deletes your account, your booking page and every service, customer and appointment.
              It cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {hasSubscription && (
            <Alert variant="warning">
              <AlertDescription>
                Your SlotEase Pro subscription will be cancelled immediately and you will not be charged again.
              </AlertDescription>
            </Alert>
          )}

          {errors.root?.message && (
            <Alert variant="destructive">
              <AlertDescription>{errors.root.message}</AlertDescription>
            </Alert>
          )}

          <Field htmlFor="del-password" label="Your password" error={errors.password?.message}>
            <Input
              id="del-password"
              type="password"
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              aria-describedby={fieldDescriptionId('del-password')}
              {...register('password')}
            />
          </Field>

          <Field
            htmlFor="del-confirm"
            label={
              <>
                Type <span className="font-mono font-semibold">{business.slug}</span> to confirm
              </>
            }
            error={errors.confirm?.message}
          >
            <Input
              id="del-confirm"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={!!errors.confirm}
              aria-describedby={fieldDescriptionId('del-confirm')}
              {...register('confirm')}
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)} disabled={remove.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" loading={remove.isPending} disabled={!confirmed}>
              Delete permanently
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Settings "Delete account" section (owner only). */
export function DeleteAccountCard({ business }: { business: BusinessOut }) {
  const [open, setOpen] = useState(false)
  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle>Delete account</CardTitle>
        <CardDescription>
          Permanently delete {business.name}, your booking page and all customers, services and appointments. This
          cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setOpen(true)}>
          <Trash2 aria-hidden="true" />
          Delete account
        </Button>
      </CardContent>
      <DeleteAccountDialog business={business} open={open} onOpenChange={setOpen} />
    </Card>
  )
}
