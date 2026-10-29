import { CheckCircle2, Circle, ExternalLink } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CopyButton } from '@/components/settings/CopyButton'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { bookingUrl } from '@/lib/utils'

interface Step {
  title: string
  description: string
  done: boolean
  action: ReactNode
}

/** Shown on Today when the business has no services yet. */
export function GettingStartedCard({ slug, hasServices }: { slug: string; hasServices: boolean }) {
  const url = bookingUrl(slug)
  const steps: Step[] = [
    {
      title: 'Add your services',
      description: 'Name, duration and price for each thing customers can book.',
      done: hasServices,
      action: (
        <Button asChild size="sm">
          <Link to="/app/services">Add services</Link>
        </Button>
      ),
    },
    {
      title: 'Check your working hours',
      description: 'We set Mon–Sat 9:00 AM–6:00 PM. Adjust days, hours and breaks.',
      done: false,
      action: (
        <Button asChild size="sm" variant="outline">
          <Link to="/app/hours">Review hours</Link>
        </Button>
      ),
    },
    {
      title: 'Share your booking link',
      description: url,
      done: false,
      action: <CopyButton size="sm" value={url} label="Copy link" successMessage="Booking link copied" />,
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Get ready for your first booking</CardTitle>
        <CardDescription>Three quick steps and customers can book you online.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="divide-y divide-border rounded-md border border-border">
          {steps.map((step) => (
            <li key={step.title} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                {step.done ? (
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-label="Done" />
                ) : (
                  <Circle className="mt-0.5 size-5 shrink-0 text-slate-300" aria-label="To do" />
                )}
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{step.title}</p>
                  <p className="text-sm break-all text-muted-foreground">{step.description}</p>
                </div>
              </div>
              <div className="shrink-0 pl-8 sm:pl-0">{step.action}</div>
            </li>
          ))}
        </ol>
        <a
          href={`/${slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary hover:underline sm:min-h-0"
        >
          Preview your booking page
          <ExternalLink className="size-4" aria-hidden="true" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </CardContent>
    </Card>
  )
}
