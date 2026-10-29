import { createContext, useContext } from 'react'
import type { AdminSession, AdminUser } from '@/admin/types'

export interface AdminAuthValue {
  admin: AdminUser | null
  /** True while a stored admin token is being checked. */
  isLoading: boolean
  /** Store the session returned by the 2FA step. */
  startSession: (session: AdminSession) => void
  signOut: () => void
}

export const AdminAuthContext = createContext<AdminAuthValue | null>(null)

/** The signed-in platform admin. Must be inside `<AdminAuthProvider>`. */
export function useAdminAuth(): AdminAuthValue {
  const ctx = useContext(AdminAuthContext)
  if (!ctx) throw new Error('useAdminAuth must be used within an AdminAuthProvider')
  return ctx
}
