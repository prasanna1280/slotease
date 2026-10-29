import { useContext } from 'react'
import { AuthContext, type AuthContextValue } from '@/context/auth-context'

/** Access the authenticated owner, their business and auth actions. Must be inside `<AuthProvider>`. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}

/**
 * The current business for pages rendered inside the protected AppShell, where it is always loaded.
 * Throws if used outside an authenticated route.
 */
export function useCurrentBusiness() {
  const { business } = useAuth()
  if (!business) throw new Error('useCurrentBusiness must be used inside a protected route')
  return business
}
