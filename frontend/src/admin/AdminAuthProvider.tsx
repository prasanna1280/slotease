import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { AdminAuthContext, useAdminAuth, type AdminAuthValue } from '@/admin/admin-auth-context'
import { ADMIN_LOGOUT_EVENT, adminService, adminToken } from '@/admin/api'
import type { AdminSession, AdminUser } from '@/admin/types'
import { PageSpinner } from '@/components/ui/spinner'

const ADMIN_QUERY_PREFIX = 'admin'

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [admin, setAdmin] = useState<AdminUser | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(() => adminToken.get() !== null)

  const signOut = useCallback(() => {
    adminToken.clear()
    setAdmin(null)
    queryClient.removeQueries({ queryKey: [ADMIN_QUERY_PREFIX] })
  }, [queryClient])

  // Restore a session from this tab's stored token.
  useEffect(() => {
    if (adminToken.get() === null) return
    let cancelled = false
    adminService
      .me()
      .then((me) => {
        if (!cancelled) setAdmin(me)
      })
      .catch(() => {
        if (!cancelled) setAdmin(null)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    window.addEventListener(ADMIN_LOGOUT_EVENT, signOut)
    return () => window.removeEventListener(ADMIN_LOGOUT_EVENT, signOut)
  }, [signOut])

  const startSession = useCallback((session: AdminSession) => {
    adminToken.set(session.access_token)
    setAdmin(session.admin)
    setIsLoading(false)
  }, [])

  const value = useMemo<AdminAuthValue>(
    () => ({ admin, isLoading, startSession, signOut }),
    [admin, isLoading, startSession, signOut],
  )
  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>
}

/** Admin-only routes: redirect to /admin/login when there is no admin session. */
export function RequireAdmin() {
  const { admin, isLoading } = useAdminAuth()
  const location = useLocation()
  if (isLoading) return <PageSpinner label="Loading admin" />
  if (!admin) {
    const next = `${location.pathname}${location.search}`
    return <Navigate to={`/admin/login?next=${encodeURIComponent(next)}`} replace />
  }
  return <Outlet />
}
