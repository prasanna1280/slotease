import { Section, SectionHeader } from '@/components/landing/Section'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'

const FAQS: { q: string; a: string }[] = [
  {
    q: 'Do my customers need to download an app or create an account?',
    a: 'No. They open your booking link in any browser, pick a service and a time, and enter their name and phone number. It takes about 30 seconds.',
  },
  {
    q: 'How does SlotEase prevent double bookings?',
    a: 'Every booking is re-checked inside a database transaction and protected by a database constraint, so even if two people tap the same slot at the same moment only one booking succeeds. The other customer is asked to pick a different time.',
  },
  {
    q: 'What happens after the 14-day free trial?',
    a: 'You can subscribe for ₹499 per month from the Billing page. If you do not subscribe, your data stays safe but your booking page stops accepting new online bookings until you do.',
  },
  {
    q: 'Can I add bookings I take over the phone or at the counter?',
    a: 'Yes. Owners can add bookings from the dashboard. They go through the same slot check, so phone and online bookings never clash.',
  },
  {
    q: 'Does it work in my timezone?',
    a: 'Yes. Each business has its own timezone, and all slots and times are shown in that timezone, even if a customer books from abroad.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. There are no contracts or setup fees. Cancel from the Billing page and you will not be charged again.',
  },
]

export function Faq() {
  return (
    <Section id="faq" labelledBy="faq-title" className="border-t border-border bg-card">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16">
        <SectionHeader
          id="faq-title"
          eyebrow="FAQ"
          title="Questions, answered"
          description="Anything else? Start your trial and explore. Nothing to install."
          align="left"
          className="mx-auto text-center lg:mx-0 lg:text-left"
        />
        <Accordion type="single" collapsible className="w-full border-t border-border">
          {FAQS.map((item, i) => (
            <AccordionItem key={item.q} value={`faq-${i}`}>
              <AccordionTrigger>{item.q}</AccordionTrigger>
              <AccordionContent>{item.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </Section>
  )
}
