import { Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Section, SectionHeader } from '@/components/landing/Section'
import { Button } from '@/components/ui/button'

const INCLUDED = [
  'Unlimited bookings and customers',
  'Your own booking page link',
  'Double-booking protection',
  'Calendar, customer history and reports',
  'Email confirmations',
  'Cancel anytime',
]

export function Pricing() {
  return (
    <Section id="pricing" labelledBy="pricing-title">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <SectionHeader
          id="pricing-title"
          eyebrow="Pricing"
          title="One simple plan. Everything included."
          description="Start free for 14 days. If SlotEase saves you even one no-show a month, it has paid for itself."
          align="left"
          className="mx-auto text-center lg:mx-0 lg:text-left"
        />

        <div className="mx-auto w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8 lg:mx-0 lg:justify-self-end">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-foreground">SlotEase Pro</h3>
            <span className="rounded-full border border-blue-200 bg-primary-subtle px-2.5 py-0.5 text-xs font-medium text-primary">
              14-day free trial
            </span>
          </div>
          <p className="mt-5 flex items-baseline gap-1.5">
            <span className="text-4xl font-semibold tracking-tight text-foreground tabular-nums">₹499</span>
            <span className="text-sm text-muted-foreground">/ month</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Billed monthly via Razorpay. No setup fee.</p>

          <ul className="mt-6 space-y-3 border-t border-border pt-6">
            {INCLUDED.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-foreground">
                <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>

          <Button asChild size="lg" className="mt-8 w-full">
            <Link to="/register">Start 14-day free trial</Link>
          </Button>
          <p className="mt-3 text-center text-xs text-muted-foreground">No card required to start.</p>
        </div>
      </div>
    </Section>
  )
}
