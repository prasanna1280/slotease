import type { ReactNode } from 'react'
import { Navigate, Outlet, useSearchParams } from 'react-router-dom'
import { PageSpinner } from '@/components/ui/spinner'
import { useAuth } from '@/hooks/useAuth'
import { safeNextPath } from '@/lib/navigation'

/** For login / register: signed-in owners are sent on to `?next=` (same-origin path only) or `/app`. */
export function GuestRoute({ children }: { children?: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  const [params] = useSearchParams()

  if (isLoading) return <PageSpinner />
  if (isAuthenticated) return <Navigate to={safeNextPath(params.get('next'))} replace />

  return children ? <>{children}</> : <Outlet />
}
