import { zodResolver } from '@hookform/resolvers/zod'
import { useState, type ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { isoToLocalInput, localInputToIso } from '@/admin/format'
import { useDeleteBusiness, useExtendTrial, useRecordPayment, useUpdateBusiness } from '@/admin/hooks'
import type { BusinessDetail, BusinessUpdate } from '@/admin/types'
import { CopyButton } from '@/components/settings/CopyButton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, fieldDescriptionId } from '@/components/ui/field'
import { fieldClasses, Input } from '@/components/ui/input'
import { getErrorCode, getErrorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'

interface DialogProps {
  business: BusinessDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}

function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  pending,
  onSubmit,
  submitLabel,
  destructive = false,
  submitDisabled = false,
  rootError,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  pending: boolean
  onSubmit: () => void
  submitLabel: string
  destructive?: boolean
  submitDisabled?: boolean
  rootError?: string
  children: ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-w-lg">
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit()
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : <DialogDescription className="sr-only">{title}</DialogDescription>}
          </DialogHeader>
          {rootError && (
            <Alert variant="destructive">
              <AlertDescription>{rootError}</AlertDescription>
            </Alert>
          )}
          {children}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" variant={destructive ? 'destructive' : 'default'} loading={pending} disabled={submitDisabled}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/* Edit                                                                */
/* ------------------------------------------------------------------ */

const editSchema = z.object({
  name: z.string().trim().min(2, 'At least 2 characters.').max(120),
  phone: z.string().trim().min(6, 'Enter a phone number.').max(20),
  email: z.union([z.literal(''), z.string().trim().email('Enter a valid email.')]),
  address: z.string().trim().max(255),
  plan: z.enum(['trial', 'pro']),
  subscription_status: z.enum(['trialing', 'active', 'past_due', 'cancelled', 'expired']),
  trial_ends_at: z.string(),
  current_period_end: z.string(),
})
type EditValues = z.infer<typeof editSchema>

const STATUS_OPTIONS: { value: EditValues['subscription_status']; label: string }[] = [
  { value: 'trialing', label: 'Trialing' },
  { value: 'active', label: 'Active (paid)' },
  { value: 'past_due', label: 'Payment due' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'expired', label: 'Expired' },
]

export function EditBusinessDialog({ business, open, onOpenChange }: DialogProps) {
  const update = useUpdateBusiness(business.id)
  const defaults: EditValues = {
    name: business.name,
    phone: business.phone,
    email: business.email ?? '',
    address: business.address ?? '',
    plan: business.plan === 'pro' ? 'pro' : 'trial',
    subscription_status: business.subscription_status as EditValues['subscription_status'],
    trial_ends_at: isoToLocalInput(business.trial_ends_at),
    current_period_end: isoToLocalInput(business.current_period_end),
  }
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<EditValues>({ resolver: zodResolver(editSchema), values: defaults })

  const submit = handleSubmit((v) => {
    // Send only what changed, so untouched dates are not rounded to the minute and logged as edits.
    const data: BusinessUpdate = {}
    if (v.name !== defaults.name) data.name = v.name
    if (v.phone !== defaults.phone) data.phone = v.phone
    if (v.email !== defaults.email) data.email = v.email || null
    if (v.address !== defaults.address) data.address = v.address || null
    if (v.plan !== defaults.plan) data.plan = v.plan
    if (v.subscription_status !== defaults.subscription_status) data.subscription_status = v.subscription_status
    if (v.trial_ends_at !== defaults.trial_ends_at) {
      data.trial_ends_at = v.trial_ends_at ? localInputToIso(v.trial_ends_at) : null
    }
    if (v.current_period_end !== defaults.current_period_end) {
      data.current_period_end = v.current_period_end ? localInputToIso(v.current_period_end) : null
    }
    if (Object.keys(data).length === 0) {
      onOpenChange(false)
      return
    }
    update.mutate(data, {
      onSuccess: () => {
        toast.success('Customer updated')
        onOpenChange(false)
      },
      onError: (err) => setError('root', { type: 'server', message: getErrorMessage(err, 'Could not save the changes.') }),
    })
  })

  const selectClass = cn(fieldClasses, 'h-11 sm:h-10')
  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset(defaults)
        onOpenChange(next)
      }}
      title={`Edit ${business.name}`}
      description="Changes are recorded in the audit log. Times are India time (IST)."
      pending={update.isPending}
      onSubmit={() => void submit()}
      submitLabel="Save changes"
      rootError={errors.root?.message}
    >
      <div className="grid max-h-[60dvh] gap-4 overflow-y-auto px-0.5 sm:grid-cols-2">
        <Field htmlFor="ed-name" label="Business name" error={errors.name?.message} className="sm:col-span-2">
          <Input id="ed-name" aria-invalid={!!errors.name} aria-describedby={fieldDescriptionId('ed-name')} {...register('name')} />
        </Field>
        <Field htmlFor="ed-phone" label="Phone" error={errors.phone?.message}>
          <Input id="ed-phone" type="tel" aria-invalid={!!errors.phone} aria-describedby={fieldDescriptionId('ed-phone')} {...register('phone')} />
        </Field>
        <Field htmlFor="ed-email" label="Business email" optional error={errors.email?.message}>
          <Input id="ed-email" type="email" aria-invalid={!!errors.email} aria-describedby={fieldDescriptionId('ed-email')} {...register('email')} />
        </Field>
        <Field htmlFor="ed-address" label="Address" optional error={errors.address?.message} className="sm:col-span-2">
          <Input id="ed-address" aria-invalid={!!errors.address} aria-describedby={fieldDescriptionId('ed-address')} {...register('address')} />
        </Field>
        <Field htmlFor="ed-plan" label="Plan">
          <select id="ed-plan" className={selectClass} {...register('plan')}>
            <option value="trial">Trial</option>
            <option value="pro">Pro</option>
          </select>
        </Field>
        <Field htmlFor="ed-status" label="Subscription status" hint="Active keeps bookings open with no end date.">
          <select id="ed-status" className={selectClass} aria-describedby={fieldDescriptionId('ed-status')} {...register('subscription_status')}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field htmlFor="ed-trial" label="Trial ends" optional>
          <Input id="ed-trial" type="datetime-local" {...register('trial_ends_at')} />
        </Field>
        <Field htmlFor="ed-period" label="Paid period ends" optional hint="Payment due / cancelled stay bookable until this.">
          <Input id="ed-period" type="datetime-local" aria-describedby={fieldDescriptionId('ed-period')} {...register('current_period_end')} />
        </Field>
      </div>
    </FormDialog>
  )
}

/* ------------------------------------------------------------------ */
/* Extend trial                                                        */
/* ------------------------------------------------------------------ */

export function ExtendTrialDialog({ business, open, onOpenChange }: DialogProps) {
  const extend = useExtendTrial(business.id)
  const [days, setDays] = useState('14')
  const n = Number(days)
  const valid = Number.isInteger(n) && n >= 1 && n <= 365
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Extend free trial"
      description="Days are added to the current trial end, or to today if the trial already ended."
      pending={extend.isPending}
      submitDisabled={!valid}
      submitLabel={valid ? `Add ${n} days` : 'Add days'}
      rootError={extend.isError ? getErrorMessage(extend.error, 'Could not extend the trial.') : undefined}
      onSubmit={() =>
        extend.mutate(n, {
          onSuccess: () => {
            toast.success(`Trial extended by ${n} days`)
            onOpenChange(false)
          },
        })
      }
    >
      <div className="flex flex-wrap gap-2">
        {[7, 14, 30].map((d) => (
          <Button key={d} type="button" variant={n === d ? 'default' : 'outline'} size="sm" onClick={() => setDays(String(d))}>
            {d} days
          </Button>
        ))}
      </div>
      <Field htmlFor="extend-days" label="Days" error={valid ? undefined : 'Enter 1 to 365 days.'}>
        <Input id="extend-days" type="number" inputMode="numeric" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} />
      </Field>
    </FormDialog>
  )
}

/* ------------------------------------------------------------------ */
/* Manual payment                                                      */
/* ------------------------------------------------------------------ */

const paymentSchema = z.object({
  amount: z
    .string()
    .trim()
    .regex(/^\d{1,7}(\.\d{1,2})?$/, 'Enter an amount like 499 or 1497.50.')
    .refine((v) => Number(v) > 0, 'Amount must be more than 0.'),
  paid_at: z.string().min(1, 'Choose when it was paid.'),
  note: z.string().trim().max(255),
})
type PaymentValues = z.infer<typeof paymentSchema>

export function RecordPaymentDialog({ business, open, onOpenChange }: DialogProps) {
  const record = useRecordPayment(business.id)
  const defaults: PaymentValues = { amount: '499', paid_at: isoToLocalInput(new Date().toISOString()), note: '' }
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<PaymentValues>({ resolver: zodResolver(paymentSchema), defaultValues: defaults })

  const submit = handleSubmit((v) => {
    record.mutate(
      { amount: v.amount, paid_at: localInputToIso(v.paid_at), note: v.note || undefined },
      {
        onSuccess: () => {
          toast.success('Payment recorded')
          reset(defaults)
          onOpenChange(false)
        },
        onError: (err) => setError('root', { type: 'server', message: getErrorMessage(err, 'Could not record the payment.') }),
      },
    )
  })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record a payment"
      description="For money received outside Razorpay (bank transfer, UPI, cash). It counts towards revenue. To give paid access, also edit the subscription status."
      pending={record.isPending}
      onSubmit={() => void submit()}
      submitLabel="Record payment"
      rootError={errors.root?.message}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field htmlFor="pay-amount" label="Amount (₹)" error={errors.amount?.message}>
          <Input id="pay-amount" inputMode="decimal" aria-invalid={!!errors.amount} aria-describedby={fieldDescriptionId('pay-amount')} {...register('amount')} />
        </Field>
        <Field htmlFor="pay-at" label="Paid on (IST)" error={errors.paid_at?.message}>
          <Input id="pay-at" type="datetime-local" aria-invalid={!!errors.paid_at} aria-describedby={fieldDescriptionId('pay-at')} {...register('paid_at')} />
        </Field>
        <Field htmlFor="pay-note" label="Note" optional error={errors.note?.message} className="sm:col-span-2">
          <Input id="pay-note" placeholder="e.g. UPI ref 4321, 3 months" aria-invalid={!!errors.note} aria-describedby={fieldDescriptionId('pay-note')} {...register('note')} />
        </Field>
      </div>
    </FormDialog>
  )
}

/* ------------------------------------------------------------------ */
/* Suspend / reactivate                                                */
/* ------------------------------------------------------------------ */

export function SuspendDialog({ business, open, onOpenChange }: DialogProps) {
  const update = useUpdateBusiness(business.id)
  const suspend = !business.is_suspended
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={suspend ? `Suspend ${business.name}?` : `Reactivate ${business.name}?`}
      description={
        suspend
          ? 'Their booking page stops taking new bookings right away. The owner can still sign in, and existing bookings stay.'
          : 'Their booking page takes bookings again (if their plan allows it).'
      }
      destructive={suspend}
      pending={update.isPending}
      submitLabel={suspend ? 'Suspend booking page' : 'Reactivate'}
      rootError={update.isError ? getErrorMessage(update.error, 'Could not update the customer.') : undefined}
      onSubmit={() =>
        update.mutate(
          { is_suspended: suspend },
          {
            onSuccess: () => {
              toast.success(suspend ? 'Booking page suspended' : 'Booking page reactivated')
              onOpenChange(false)
            },
          },
        )
      }
    >
      {null}
    </FormDialog>
  )
}

/* ------------------------------------------------------------------ */
/* Delete                                                              */
/* ------------------------------------------------------------------ */

export function DeleteBusinessDialog({
  business,
  open,
  onOpenChange,
  onDeleted,
}: DialogProps & { onDeleted: () => void }) {
  const remove = useDeleteBusiness(business.id)
  const { register, control, reset } = useForm<{ confirm: string }>({ defaultValues: { confirm: '' } })
  const confirm = useWatch({ control, name: 'confirm' })
  const matches = confirm.trim().toLowerCase() === business.slug
  const code = remove.isError ? getErrorCode(remove.error) : undefined
  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset({ confirm: '' })
        onOpenChange(next)
      }}
      title={`Delete ${business.name}?`}
      description="Deletes the business, its owner login, services, customers and bookings. A live Razorpay subscription is cancelled. Payments and the audit log are kept. This cannot be undone."
      destructive
      pending={remove.isPending}
      submitDisabled={!matches}
      submitLabel="Delete permanently"
      rootError={
        remove.isError
          ? code === 'PAYMENT_PROVIDER_ERROR'
            ? 'Razorpay could not cancel the subscription, so nothing was deleted. Try again.'
            : getErrorMessage(remove.error, 'Could not delete the customer.')
          : undefined
      }
      onSubmit={() =>
        remove.mutate(confirm.trim(), {
          onSuccess: () => {
            toast.success(`${business.name} was deleted`)
            onDeleted()
          },
        })
      }
    >
      <Field
        htmlFor="del-biz-confirm"
        label={
          <>
            Type <span className="font-mono font-semibold">{business.slug}</span> to confirm
          </>
        }
      >
        <Input id="del-biz-confirm" autoComplete="off" autoCapitalize="none" spellCheck={false} {...register('confirm')} />
      </Field>
    </FormDialog>
  )
}

/* ------------------------------------------------------------------ */
/* Reset link result                                                   */
/* ------------------------------------------------------------------ */

export function ResetLinkDialog({
  link,
  email,
  onOpenChange,
}: {
  link: { url: string; minutes: number } | null
  email: string
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={link !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Password reset link</DialogTitle>
          <DialogDescription>
            We e-mailed it to {email} (if e-mail is set up). You can also share it yourself. It works once and expires in{' '}
            {link?.minutes ?? 30} minutes.
          </DialogDescription>
        </DialogHeader>
        {link && (
          <div className="space-y-3">
            <p className="rounded-md border border-border bg-muted/50 p-3 font-mono text-xs break-all select-all">{link.url}</p>
            <CopyButton value={link.url} label="Copy link" successMessage="Link copied" className="w-full" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
