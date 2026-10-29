import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { PageSpinner } from '@/components/ui/spinner'
import { useAuth } from '@/hooks/useAuth'

/** Renders children (or the nested route) only for signed-in owners; otherwise redirects to `/login?next=`. */
export function ProtectedRoute({ children }: { children?: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <PageSpinner label="Loading your workspace" />

  if (!isAuthenticated) {
    const next = `${location.pathname}${location.search}`
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }

  return children ? <>{children}</> : <Outlet />
}
