import { useQueryClient } from '@tanstack/react-query'
import { CreditCard, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { PlanCard } from '@/components/billing/PlanCard'
import { QueryErrorAlert } from '@/components/dashboard/QueryErrorAlert'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth, useCurrentBusiness } from '@/hooks/useAuth'
import { useBilling, useCancelSubscription, useSubscribe, useVerifySubscription } from '@/hooks/useBilling'
import { formatDate } from '@/lib/datetime'
import { getErrorCode, getErrorMessage } from '@/lib/errors'
import { queryKeys } from '@/lib/queryKeys'
import { CheckoutDismissedError, openRazorpayCheckout } from '@/lib/razorpay'

export default function BillingPage() {
  const business = useCurrentBusiness()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const billing = useBilling()
  const subscribe = useSubscribe()
  const verify = useVerifySubscription()
  const cancel = useCancelSubscription()
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)

  const busy = subscribe.isPending || verify.isPending || checkoutOpen

  const startSubscription = async () => {
    let sub
    try {
      sub = await subscribe.mutateAsync()
    } catch (err) {
      const code = getErrorCode(err)
      if (code === 'BILLING_NOT_CONFIGURED') {
        toast.info('Billing is not configured on this server.')
      } else if (code === 'ALREADY_SUBSCRIBED') {
        toast.info('You already have an active subscription.')
        void queryClient.invalidateQueries({ queryKey: queryKeys.billing })
      } else {
        toast.error(getErrorMessage(err, 'Could not start the subscription.'))
      }
      return
    }

    setCheckoutOpen(true)
    try {
      const response = await openRazorpayCheckout({
        key: sub.key_id,
        subscription_id: sub.subscription_id,
        name: 'SlotEase',
        description: 'SlotEase Pro · ₹499/month',
        prefill: { name: sub.name || user?.full_name, email: sub.email || user?.email, contact: sub.contact },
        notes: { business: business.slug },
        theme: { color: '#1d4ed8' },
      })
      setCheckoutOpen(false)
      verify.mutate(response, {
        onSuccess: () => toast.success('Subscription active. Thank you!', { description: 'Your plan is now SlotEase Pro.' }),
        onError: (err) =>
          toast.error(
            getErrorCode(err) === 'INVALID_SIGNATURE'
              ? 'We could not verify the payment. If you were charged, it will be confirmed automatically shortly.'
              : getErrorMessage(err, 'Could not verify the payment.'),
          ),
      })
    } catch (err) {
      setCheckoutOpen(false)
      if (err instanceof CheckoutDismissedError) toast('Checkout closed. You have not been charged.')
      else toast.error(getErrorMessage(err, 'Payment did not complete.'))
    }
  }

  const onCancel = () => {
    cancel.mutate(undefined, {
      onSuccess: (b) => {
        setConfirmCancel(false)
        toast.success('Subscription cancelled', {
          description: b.current_period_end
            ? `You keep access until ${formatDate(b.current_period_end, business.timezone)}.`
            : undefined,
        })
      },
      onError: (err) => {
        setConfirmCancel(false)
        if (getErrorCode(err) === 'NO_ACTIVE_SUBSCRIPTION') {
          toast.info('There is no active subscription to cancel.')
          void queryClient.invalidateQueries({ queryKey: queryKeys.billing })
        } else {
          toast.error(getErrorMessage(err, 'Could not cancel the subscription.'))
        }
      },
    })
  }

  return (
    <>
      <PageHeader title="Billing" description="Your SlotEase plan and payments." />

      {billing.isError ? (
        <QueryErrorAlert
          title="Could not load billing"
          error={billing.error}
          onRetry={() => void billing.refetch()}
          retrying={billing.isFetching}
        />
      ) : billing.isPending ? (
        <div className="max-w-3xl space-y-4" aria-busy="true" aria-label="Loading billing">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-72" />
        </div>
      ) : (
        <div className="max-w-3xl space-y-4">
          {!billing.data.billing_configured && (
            <Alert variant="info">
              <AlertTitle>Billing is not configured on this server</AlertTitle>
              <AlertDescription>
                Razorpay keys are not set, so subscriptions cannot be started here. Your trial and bookings keep
                working as normal.
              </AlertDescription>
            </Alert>
          )}

          <PlanCard
            billing={billing.data}
            timezone={business.timezone}
            actions={
              <>
                {(billing.data.subscription_status === 'active' || billing.data.subscription_status === 'past_due') &&
                  billing.data.razorpay_subscription_id && (
                    <Button variant="outline" onClick={() => setConfirmCancel(true)} disabled={busy}>
                      Cancel subscription
                    </Button>
                  )}
                {billing.data.subscription_status !== 'active' && (
                  <Button
                    onClick={() => void startSubscription()}
                    loading={busy}
                    disabled={!billing.data.billing_configured}
                  >
                    {!busy && <CreditCard aria-hidden="true" />}
                    {billing.data.subscription_status === 'cancelled' ? 'Resubscribe for ₹499/month' : 'Subscribe for ₹499/month'}
                  </Button>
                )}
              </>
            }
          />

          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Payments are processed securely by Razorpay (cards, UPI and net banking). SlotEase never sees your card
            details.
          </p>
        </div>
      )}

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancel your subscription?"
        description="You keep Pro until the end of the current billing period. After that, customers can no longer book online."
        confirmLabel="Cancel subscription"
        cancelLabel="Keep Pro"
        variant="destructive"
        loading={cancel.isPending}
        onConfirm={onCancel}
      />
    </>
  )
}
