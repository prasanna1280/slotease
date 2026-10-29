import { ShieldAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { Button } from '@/components/ui/button'
import { PageSpinner } from '@/components/ui/spinner'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { tokenStorage, type ViewAsSession } from '@/lib/tokenStorage'

/** Read the hand-off from the URL fragment (never sent to the server or written to logs). */
function parseHandoff(hash: string): ViewAsSession | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const token = params.get('token')
  const business = params.get('business')
  const owner = params.get('owner')
  const expiresAt = Number(params.get('exp'))
  if (!token || !business || !owner || !Number.isFinite(expiresAt)) return null
  if (expiresAt * 1000 <= Date.now()) return null
  return { token, business, owner, expiresAt }
}

/**
 * Landing page for an admin's "View as owner" link: stores the read-only session for this tab only,
 * strips the token from the address bar, and reloads into the owner app.
 */
export default function ViewAsPage() {
  useDocumentTitle('Opening read-only view')
  const [session] = useState(() => parseHandoff(window.location.hash))

  useEffect(() => {
    window.history.replaceState(null, '', window.location.pathname)
    if (!session) return
    tokenStorage.startViewAs(session)
    // Full reload so the owner app starts with this tab's view-as session.
    window.location.replace('/app')
  }, [session])

  if (session) return <PageSpinner label="Opening read-only view" />
  return (
    <PublicLayout hideAuthActions className="items-center justify-center px-4 py-16">
      <div className="flex max-w-md flex-col items-center text-center">
        <ShieldAlert className="mb-4 size-10 text-muted-foreground" aria-hidden="true" />
        <h1 className="text-xl font-semibold text-foreground">This view link has expired</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Read-only views open from the admin panel and work for 15 minutes. Open the customer in the admin panel and
          choose View as owner again.
        </p>
        <Button asChild className="mt-6">
          <Link to="/admin/customers">Back to admin</Link>
        </Button>
      </div>
    </PublicLayout>
  )
}
