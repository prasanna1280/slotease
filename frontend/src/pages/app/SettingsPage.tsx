import { Building2, Link2, SlidersHorizontal, UserRound } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { AccountSettings } from '@/components/settings/AccountSettings'
import { BookingLinkPanel } from '@/components/settings/BookingLinkPanel'
import { BookingRulesForm } from '@/components/settings/BookingRulesForm'
import { BusinessSettingsForm } from '@/components/settings/BusinessSettingsForm'
import { PageHeader } from '@/components/ui/page-header'
import { PageSpinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth, useCurrentBusiness } from '@/hooks/useAuth'

const TABS = ['business', 'rules', 'link', 'account'] as const
type Tab = (typeof TABS)[number]

function isTab(value: string | null): value is Tab {
  return value !== null && (TABS as readonly string[]).includes(value)
}

export default function SettingsPage() {
  const business = useCurrentBusiness()
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: Tab = isTab(raw) ? raw : 'business'
  const setTab = (next: string) => setParams(next === 'business' ? {} : { tab: next }, { replace: true })

  if (!user) return <PageSpinner />

  return (
    <>
      <PageHeader title="Settings" description="Business profile, booking rules and your account." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Settings sections">
          <TabsTrigger value="business">
            <Building2 aria-hidden="true" />
            Business
          </TabsTrigger>
          <TabsTrigger value="rules">
            <SlidersHorizontal aria-hidden="true" />
            Booking rules
          </TabsTrigger>
          <TabsTrigger value="link">
            <Link2 aria-hidden="true" />
            Booking link
          </TabsTrigger>
          <TabsTrigger value="account">
            <UserRound aria-hidden="true" />
            Account
          </TabsTrigger>
        </TabsList>
        <TabsContent value="business">
          {/* Re-mount when the saved business changes so defaults stay in sync. */}
          <BusinessSettingsForm key={business.slug + business.timezone} business={business} />
        </TabsContent>
        <TabsContent value="rules">
          <BookingRulesForm business={business} />
        </TabsContent>
        <TabsContent value="link">
          <BookingLinkPanel business={business} onEditSlug={() => setTab('business')} />
        </TabsContent>
        <TabsContent value="account">
          <AccountSettings user={user} />
        </TabsContent>
      </Tabs>
    </>
  )
}
