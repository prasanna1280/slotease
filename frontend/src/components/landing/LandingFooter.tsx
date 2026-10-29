import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/layout/Logo'
import { Button } from '@/components/ui/button'

export function CtaBand() {
  return (
    <section aria-labelledby="cta-title" className="bg-primary">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col items-center gap-6 px-4 py-14 text-center sm:px-6 sm:py-16 lg:flex-row lg:justify-between lg:px-8 lg:text-left">
        <div className="max-w-2xl">
          <h2 id="cta-title" className="text-2xl font-semibold tracking-tight text-balance text-white sm:text-3xl">
            Ready to stop double bookings for good?
          </h2>
          <p className="mt-2 text-base text-blue-100">Set up your booking page today. Free for 14 days.</p>
        </div>
        <Button
          asChild
          size="lg"
          className="w-full bg-white text-primary shadow-sm hover:bg-blue-50 focus-visible:outline-white sm:w-auto"
        >
          <Link to="/register">
            Start 14-day free trial
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </section>
  )
}

const linkClass =
  'inline-flex min-h-11 items-center rounded-sm text-sm text-muted-foreground hover:text-foreground sm:min-h-8'

export function LandingFooter() {
  const year = new Date().getFullYear()
  return (
    <footer className="border-t border-border bg-card px-safe pb-safe">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="max-w-sm">
            <Logo to="/" />
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Online appointment booking for clinics and salons. Customers book in 30 seconds, owners run the day from
              one dashboard.
            </p>
          </div>
          <nav aria-labelledby="footer-product">
            <h2 id="footer-product" className="text-sm font-semibold text-foreground">
              Product
            </h2>
            <ul className="mt-2">
              <li>
                <a href="#how-it-works" className={linkClass}>
                  How it works
                </a>
              </li>
              <li>
                <a href="#features" className={linkClass}>
                  Features
                </a>
              </li>
              <li>
                <a href="#pricing" className={linkClass}>
                  Pricing
                </a>
              </li>
              <li>
                <a href="#faq" className={linkClass}>
                  FAQ
                </a>
              </li>
            </ul>
          </nav>
          <nav aria-labelledby="footer-account">
            <h2 id="footer-account" className="text-sm font-semibold text-foreground">
              Account
            </h2>
            <ul className="mt-2">
              <li>
                <Link to="/login" className={linkClass}>
                  Sign in
                </Link>
              </li>
              <li>
                <Link to="/register" className={linkClass}>
                  Start free trial
                </Link>
              </li>
              <li>
                <Link to="/forgot-password" className={linkClass}>
                  Reset password
                </Link>
              </li>
            </ul>
          </nav>
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} SlotEase. All rights reserved.</p>
          <p>Made for appointment businesses in India and beyond.</p>
        </div>
      </div>
    </footer>
  )
}
