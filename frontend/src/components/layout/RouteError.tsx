import { TriangleAlert } from 'lucide-react'
import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

/** Router-level error boundary (failed lazy chunk after a deploy, render errors, 404 responses). */
export function RouteError() {
  const error = useRouteError()
  const is404 = isRouteErrorResponse(error) && error.status === 404

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-16 pt-safe pb-safe">
      <EmptyState
        className="w-full max-w-lg"
        icon={TriangleAlert}
        title={is404 ? 'Page not found' : 'Something went wrong'}
        description={
          is404
            ? 'The page you are looking for does not exist.'
            : 'An unexpected error occurred. Reloading the page usually fixes it.'
        }
        action={
          <>
            <Button onClick={() => window.location.reload()}>Reload page</Button>
            <Button asChild variant="outline">
              <Link to="/">Go home</Link>
            </Button>
          </>
        }
      />
    </div>
  )
}
