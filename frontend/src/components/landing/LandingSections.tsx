import {
  Activity,
  Bell,
  CalendarClock,
  ChartColumn,
  Flower2,
  Link2,
  Scissors,
  ShieldCheck,
  Smartphone,
  Stethoscope,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Section, SectionHeader } from '@/components/landing/Section'

/* ------------------------------------------------------------------ */
/* How it works                                                        */
/* ------------------------------------------------------------------ */

const STEPS: { title: string; body: string; icon: LucideIcon }[] = [
  {
    title: 'Add your services and hours',
    body: 'List what you offer with duration and price, and set the hours you are open. Takes about five minutes.',
    icon: CalendarClock,
  },
  {
    title: 'Share your booking link',
    body: 'Put your SlotEase link on WhatsApp, Instagram and Google. Customers pick a service and a free time.',
    icon: Link2,
  },
  {
    title: 'Run your day from one screen',
    body: 'Every booking lands on your dashboard instantly. Mark visits completed or no-show with one tap.',
    icon: Smartphone,
  },
]

export function HowItWorks() {
  return (
    <Section id="how-it-works" labelledBy="how-title">
      <SectionHeader
        id="how-title"
        eyebrow="How it works"
        title="Live in three simple steps"
        description="No training, no setup calls. If you can send a WhatsApp message, you can run SlotEase."
      />
      <ol className="mt-12 grid gap-6 md:grid-cols-3 md:gap-8">
        {STEPS.map(({ title, body, icon: Icon }, i) => (
          <li key={title} className="relative rounded-lg border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="flex size-10 items-center justify-center rounded-md bg-primary-subtle text-primary">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="text-sm font-semibold text-muted-foreground tabular-nums" aria-hidden="true">
                0{i + 1}
              </span>
            </div>
            <h3 className="mt-5 text-base font-semibold text-foreground">
              <span className="sr-only">Step {i + 1}: </span>
              {title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
          </li>
        ))}
      </ol>
    </Section>
  )
}

/* ------------------------------------------------------------------ */
/* Features                                                            */
/* ------------------------------------------------------------------ */

const FEATURES: { title: string; body: string; icon: LucideIcon }[] = [
  {
    title: 'Zero double bookings',
    body: 'Every slot is checked and locked at the database level, so two customers can never get the same time.',
    icon: ShieldCheck,
  },
  {
    title: '30-second mobile booking',
    body: 'A fast, clean booking page that works one-handed on any phone. No app or account for your customers.',
    icon: Smartphone,
  },
  {
    title: 'Your day at a glance',
    body: "Today's schedule, revenue and next appointment on one screen, plus a week view for planning ahead.",
    icon: CalendarClock,
  },
  {
    title: 'Customer history',
    body: 'See every visit, no-show and note for each customer. Repeat customers are recognised by phone number.',
    icon: Users,
  },
  {
    title: 'Instant confirmations',
    body: 'Customers get a booking ID and a calendar invite the moment they book, and an email if they share one.',
    icon: Bell,
  },
  {
    title: 'Reports that matter',
    body: 'Monthly bookings, no-show rate, busiest days and top services, without spreadsheets.',
    icon: ChartColumn,
  },
]

export function Features() {
  return (
    <Section id="features" labelledBy="features-title" className="border-y border-border bg-card">
      <SectionHeader
        id="features-title"
        eyebrow="Features"
        title="Everything you need to fill your calendar"
        description="Purpose-built for appointment businesses. No bloat, no per-booking fees."
      />
      <ul className="mt-12 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ title, body, icon: Icon }) => (
          <li key={title} className="bg-card p-6 sm:p-8">
            <Icon className="size-6 text-primary" aria-hidden="true" />
            <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
          </li>
        ))}
      </ul>
    </Section>
  )
}

/* ------------------------------------------------------------------ */
/* Built for                                                           */
/* ------------------------------------------------------------------ */

const SEGMENTS: { label: string; body: string; icon: LucideIcon }[] = [
  { label: 'Salons', body: 'Haircuts, colour and grooming', icon: Scissors },
  { label: 'Clinics', body: 'Doctors, dentists and diagnostics', icon: Stethoscope },
  { label: 'Physiotherapy', body: 'Sessions and follow-ups', icon: Activity },
  { label: 'Spas', body: 'Massages, facials and wellness', icon: Flower2 },
]

export function Segments() {
  return (
    <Section labelledBy="segments-title" className="py-12 sm:py-14 lg:py-16">
      <h2 id="segments-title" className="text-center text-sm font-semibold text-muted-foreground">
        Built for appointment-based businesses
      </h2>
      <ul className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {SEGMENTS.map(({ label, body, icon: Icon }) => (
          <li
            key={label}
            className="flex min-w-0 flex-col items-start gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:p-5"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">{label}</span>
              <span className="block text-xs leading-snug text-muted-foreground">{body}</span>
            </span>
          </li>
        ))}
      </ul>
    </Section>
  )
}
