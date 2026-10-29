import { ArrowLeft, SearchX } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { Button } from '@/components/ui/button'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

export default function NotFoundPage() {
  useDocumentTitle('Page not found')
  return (
    <PublicLayout className="items-center justify-center px-4 py-16 sm:py-24">
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <div className="mb-6 flex size-14 items-center justify-center rounded-full bg-muted">
          <SearchX className="size-7 text-muted-foreground" aria-hidden="true" />
        </div>
        <p className="text-sm font-semibold text-primary tabular-nums">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Page not found</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
          The page you are looking for does not exist or has moved. If you were trying to book an appointment, check
          the link the business shared with you.
        </p>
        <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Button asChild size="lg">
            <Link to="/">
              <ArrowLeft aria-hidden="true" />
              Back to home
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/login">Owner sign in</Link>
          </Button>
        </div>
      </div>
    </PublicLayout>
  )
}
