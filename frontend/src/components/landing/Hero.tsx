import { ArrowRight, Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ProductPreview } from '@/components/landing/ProductPreview'
import { Button } from '@/components/ui/button'

const POINTS = ['14-day free trial', 'No card required', 'Set up in 5 minutes']

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="border-b border-border bg-card">
      <div className="mx-auto grid w-full max-w-[1200px] items-center gap-12 px-4 pt-12 pb-16 sm:px-6 sm:pt-16 sm:pb-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12 lg:px-8 lg:pt-20 lg:pb-24">
        <div className="min-w-0 text-center lg:text-left">
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
            Built for clinics, salons and studios
          </p>
          <h1
            id="hero-title"
            className="mt-5 text-[2rem] leading-[1.15] font-semibold tracking-tight text-balance text-foreground sm:text-5xl sm:leading-[1.1] lg:text-[3.25rem]"
          >
            Online bookings for clinics and salons. <span className="text-primary">Zero double bookings.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg lg:mx-0">
            Give customers a booking link they can use in 30 seconds. See your whole day on one screen. SlotEase
            checks every slot so two people never get the same time.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <Button asChild size="lg">
              <Link to="/register">
                Start 14-day free trial
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#how-it-works">See how it works</a>
            </Button>
          </div>
          <ul className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground lg:justify-start">
            {POINTS.map((p) => (
              <li key={p} className="flex items-center gap-1.5">
                <Check className="size-4 text-success" aria-hidden="true" />
                {p}
              </li>
            ))}
          </ul>
        </div>

        <ProductPreview />
      </div>
    </section>
  )
}
