import { CalendarClock, Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { SubscriptionBadge } from '@/components/ui/status-badge'
import { daysUntil, formatDate } from '@/lib/datetime'
import { formatMoney } from '@/lib/money'
import { pluralize } from '@/lib/utils'
import type { BillingOut } from '@/types/api'

const PRO_FEATURES = [
  'Unlimited online bookings',
  'Your own booking page link',
  'Zero double bookings, guaranteed',
  'Customer history and no-show tracking',
  'Email confirmations for every booking',
  'Monthly reports and revenue estimates',
] as const

function statusLine(billing: BillingOut, tz: string): ReactNode {
  const { subscription_status: status, trial_ends_at: trialEnd, current_period_end: periodEnd } = billing
  if (status === 'trialing' && trialEnd) {
    const days = daysUntil(trialEnd)
    return (
      <>
        Free trial ends <strong className="font-semibold text-foreground">{formatDate(trialEnd, tz)}</strong>
        {days > 0 ? ` (${pluralize(days, 'day')} left)` : ' (today)'}
      </>
    )
  }
  if (status === 'active' && periodEnd) {
    return (
      <>
        Renews on <strong className="font-semibold text-foreground">{formatDate(periodEnd, tz)}</strong>
      </>
    )
  }
  if (status === 'cancelled' && periodEnd) {
    return (
      <>
        Cancelled · access until <strong className="font-semibold text-foreground">{formatDate(periodEnd, tz)}</strong>
      </>
    )
  }
  if (status === 'past_due') return 'Your last payment did not go through.'
  if (status === 'expired') return 'Your trial has ended.'
  return null
}

export function PlanCard({ billing, timezone, actions }: { billing: BillingOut; timezone: string; actions: ReactNode }) {
  const line = statusLine(billing, timezone)
  const isPro = billing.plan === 'pro'

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-lg">{isPro ? 'SlotEase Pro' : 'Free trial'}</CardTitle>
          <SubscriptionBadge status={billing.subscription_status} />
        </div>
        {line && (
          <CardDescription className="flex items-start gap-1.5">
            <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{line}</span>
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        {!billing.is_bookable && (
          <Alert variant="destructive">
            <AlertTitle>Online booking is paused</AlertTitle>
            <AlertDescription>Subscribe to SlotEase Pro to start taking bookings again.</AlertDescription>
          </Alert>
        )}
        {billing.subscription_status === 'past_due' && billing.is_bookable && (
          <Alert variant="warning">
            <AlertDescription>
              Razorpay will retry the payment. Make sure your card or UPI mandate is active to avoid interruption.
            </AlertDescription>
          </Alert>
        )}

        <div className="rounded-md border border-border p-4">
          <p className="flex items-baseline gap-1">
            <span className="text-3xl font-semibold tracking-tight text-foreground tabular-nums">
              {formatMoney(billing.price_inr, 'INR')}
            </span>
            <span className="text-sm text-muted-foreground">/ month</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">One plan, everything included. Cancel any time.</p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
                <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">{actions}</CardFooter>
    </Card>
  )
}
