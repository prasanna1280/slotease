import { Faq } from '@/components/landing/Faq'
import { Hero } from '@/components/landing/Hero'
import { CtaBand, LandingFooter } from '@/components/landing/LandingFooter'
import { Features, HowItWorks, Segments } from '@/components/landing/LandingSections'
import { Pricing } from '@/components/landing/Pricing'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { Button } from '@/components/ui/button'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

const NAV = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
]

export default function LandingPage() {
  useDocumentTitle('')

  const navLinks = NAV.map((item) => (
    <Button key={item.href} asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
      <a href={item.href}>{item.label}</a>
    </Button>
  ))

  return (
    <>
      <PublicLayout navLinks={navLinks} hideFooter>
        <Hero />
        <HowItWorks />
        <Features />
        <Segments />
        <Pricing />
        <Faq />
        <CtaBand />
      </PublicLayout>
      <LandingFooter />
    </>
  )
}
