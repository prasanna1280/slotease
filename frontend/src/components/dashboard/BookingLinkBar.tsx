import { ExternalLink, Link2 } from 'lucide-react'
import { CopyButton } from '@/components/settings/CopyButton'
import { Button } from '@/components/ui/button'
import { bookingUrl } from '@/lib/utils'

/** Compact "your booking link" row with Copy and Open. */
export function BookingLinkBar({ slug }: { slug: string }) {
  const url = bookingUrl(slug)
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2">
        <Link2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm text-muted-foreground">Booking link</span>
        <span className="min-w-0 truncate text-sm font-medium text-foreground" title={url}>
          {url.replace(/^https?:\/\//, '')}
        </span>
      </div>
      <div className="flex shrink-0 gap-2">
        <CopyButton size="sm" value={url} label="Copy" successMessage="Booking link copied" className="flex-1 sm:flex-none" />
        <Button asChild size="sm" variant="outline" className="flex-1 sm:flex-none">
          <a href={`/${slug}`} target="_blank" rel="noopener noreferrer">
            <ExternalLink aria-hidden="true" />
            Open
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </Button>
      </div>
    </div>
  )
}
