import { ExternalLink } from 'lucide-react'
import { CopyButton } from '@/components/settings/CopyButton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { bookingUrl } from '@/lib/utils'
import type { BusinessOut } from '@/types/api'

export function BookingLinkPanel({ business, onEditSlug }: { business: BusinessOut; onEditSlug: () => void }) {
  const url = bookingUrl(business.slug)
  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>Your booking link</CardTitle>
        <CardDescription>
          Share it on WhatsApp, Instagram, Google Business Profile or print it at your counter.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="booking-link" className="sr-only">
            Booking link
          </label>
          <Input
            id="booking-link"
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="font-mono text-sm sm:flex-1"
          />
          <div className="flex gap-2">
            <CopyButton value={url} label="Copy link" successMessage="Booking link copied" className="flex-1 sm:flex-none" />
            <Button asChild variant="outline" className="flex-1 sm:flex-none">
              <a href={`/${business.slug}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden="true" />
                Open
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </Button>
          </div>
        </div>
        {!business.is_bookable && (
          <Alert variant="warning">
            <AlertDescription>Online booking is paused until you subscribe, so this page shows a notice instead of slots.</AlertDescription>
          </Alert>
        )}
        <p className="text-sm text-muted-foreground">
          Want a different address?{' '}
          <Button variant="link" onClick={onEditSlug} className="align-baseline">
            Change it in Business details
          </Button>
        </p>
      </CardContent>
    </Card>
  )
}
