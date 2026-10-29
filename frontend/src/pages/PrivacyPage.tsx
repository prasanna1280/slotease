import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { PRIVACY_CONTACT_EMAIL, PRIVACY_LAST_UPDATED } from '@/lib/legal'

interface Section {
  id: string
  title: string
  body: ReactNode
}

const contactLink = (
  <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`} className="break-all font-medium text-primary hover:underline">
    {PRIVACY_CONTACT_EMAIL}
  </a>
)

const SECTIONS: Section[] = [
  {
    id: 'who-we-are',
    title: 'Who we are',
    body: (
      <>
        <p>
          SlotEase is an online appointment booking service for clinics, salons and similar businesses, available at
          slotease.prasanna.digital. This policy explains what personal data SlotEase handles, why, and the choices you
          have.
        </p>
        <p>SlotEase handles data in two roles:</p>
        <ul>
          <li>
            <strong>Business owners and staff</strong> who create a SlotEase account. For this account data, SlotEase
            decides how it is used.
          </li>
          <li>
            <strong>Customers</strong> who book an appointment on a business's booking page. That booking data belongs
            to the business you book with. SlotEase stores and processes it on the business's behalf so it can manage
            your appointment.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'what-we-collect',
    title: 'Information we collect',
    body: (
      <>
        <h3>If you run a business on SlotEase</h3>
        <ul>
          <li>Your name, email address and password. Passwords are stored only as a one-way bcrypt hash.</li>
          <li>
            Business details: business name, booking page address, phone, email, address, timezone, services and
            prices, working hours and booking rules.
          </li>
          <li>
            Subscription status and the Razorpay subscription reference. Card, UPI and bank details are entered directly
            with Razorpay and never reach SlotEase.
          </li>
        </ul>
        <h3>If you book an appointment</h3>
        <ul>
          <li>Your name and phone number.</li>
          <li>Your email address and notes for the business, if you choose to give them.</li>
          <li>
            The service, date and time you booked, and the appointment status the business records (for example
            completed, cancelled or no-show).
          </li>
        </ul>
        <h3>Technical data</h3>
        <ul>
          <li>
            Your IP address, used to limit repeated requests (these counters expire within minutes) and recorded in
            server logs, which are rotated automatically.
          </li>
          <li>
            Owners who sign in have their login tokens kept in the browser's local storage on their own device.
            SlotEase does not use advertising or analytics cookies and does not track you across other websites.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'how-we-use',
    title: 'How we use it',
    body: (
      <ul>
        <li>To run the service: show free time slots, record bookings and give owners their dashboard and reports.</li>
        <li>To send booking confirmations, password-reset emails and other service messages.</li>
        <li>To manage subscriptions and payments.</li>
        <li>To keep the service secure, for example to prevent abuse, spam bookings and unauthorised access.</li>
      </ul>
    ),
  },
  {
    id: 'sharing',
    title: 'Who we share it with',
    body: (
      <>
        <p>SlotEase does not sell personal data or use it for advertising. It is shared only with:</p>
        <ul>
          <li>
            <strong>The business you book with</strong>, which sees your booking details so it can serve you.
          </li>
          <li>
            <strong>Hostinger</strong>, which provides the server SlotEase runs on.
          </li>
          <li>
            <strong>Razorpay</strong>, which processes subscription payments for business owners.
          </li>
          <li>
            <strong>Our email delivery provider</strong>, which sends confirmation and password-reset emails.
          </li>
          <li>
            <strong>Google Fonts</strong>, which serves the website's typeface. Your browser downloads it from Google,
            so Google receives your IP address.
          </li>
          <li>Authorities, where the law requires it.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'retention',
    title: 'How long we keep it',
    body: (
      <ul>
        <li>Account and booking data is kept while the business's account is open.</li>
        <li>Sign-in sessions expire after 7 days of inactivity.</li>
        <li>
          When an owner deletes the account in Settings, the account and all of its booking data are deleted
          immediately. If you ask us by email instead, we do it within 30 days. Backups are deleted within a further 14
          days.
        </li>
      </ul>
    ),
  },
  {
    id: 'security',
    title: 'How we protect it',
    body: (
      <p>
        All traffic is encrypted with HTTPS. Passwords are hashed, and every business can only ever see its own data.
        Access to the server is restricted to the people who operate SlotEase. No system is perfectly secure, but we
        work to protect your data and will act promptly if something goes wrong.
      </p>
    ),
  },
  {
    id: 'your-rights',
    title: 'Your rights',
    body: (
      <>
        <p>
          You can ask to access, correct or delete your personal data, withdraw consent, or raise a complaint about how
          it is handled.
        </p>
        <ul>
          <li>
            <strong>Customers:</strong> the quickest route is to contact the business you booked with, as they manage
            your booking. You can also write to us and we will help.
          </li>
          <li>
            <strong>Business owners:</strong> you can update your details or permanently delete your account in
            Settings → Account. You can also email us for a copy of your data.
          </li>
        </ul>
        <p>We reply within 30 days.</p>
      </>
    ),
  },
  {
    id: 'children',
    title: 'Children',
    body: (
      <p>
        SlotEase is not intended for children. A parent or guardian should make bookings on behalf of anyone under 18.
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    body: (
      <p>
        If we change this policy, we will update the date at the top of this page. For significant changes, we will
        also notify business owners by email.
      </p>
    ),
  },
  {
    id: 'contact',
    title: 'Contact',
    body: <p>For any privacy question or request, email {contactLink}.</p>,
  },
]

export default function PrivacyPage() {
  useDocumentTitle('Privacy policy')
  return (
    <PublicLayout className="px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <article className="mx-auto w-full max-w-3xl">
        <header className="border-b border-border pb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Privacy policy</h1>
          <p className="mt-2 text-sm text-muted-foreground">Last updated {PRIVACY_LAST_UPDATED}</p>
        </header>

        <nav aria-labelledby="privacy-contents" className="mt-6 rounded-lg border border-border bg-card p-4 sm:p-5">
          <h2 id="privacy-contents" className="text-sm font-semibold text-foreground">
            Contents
          </h2>
          <ol className="mt-2 grid gap-x-6 sm:grid-cols-2">
            {SECTIONS.map((s, i) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground sm:min-h-8"
                >
                  <span className="mr-2 tabular-nums">{i + 1}.</span>
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-8 space-y-10">
          {SECTIONS.map((s, i) => (
            <section
              key={s.id}
              id={s.id}
              aria-labelledby={`${s.id}-title`}
              className="scroll-mt-24 space-y-3 text-base leading-relaxed text-foreground [&_h3]:pt-2 [&_h3]:text-base [&_h3]:font-semibold [&_li]:pl-1 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5"
            >
              <h2 id={`${s.id}-title`} className="text-lg font-semibold tracking-tight sm:text-xl">
                <span className="mr-2 text-muted-foreground tabular-nums">{i + 1}.</span>
                {s.title}
              </h2>
              {s.body}
            </section>
          ))}
        </div>

        <p className="mt-12 border-t border-border pt-6 text-sm text-muted-foreground">
          <Link to="/" className="font-medium text-primary hover:underline">
            Back to SlotEase
          </Link>
        </p>
      </article>
    </PublicLayout>
  )
}
