import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AuthContext, type AuthContextValue } from '@/context/auth-context'
import { getErrorStatus } from '@/lib/errors'
import { tokenStorage } from '@/lib/tokenStorage'
import { AUTH_LOGOUT_EVENT, AUTH_REFRESHED_EVENT } from '@/services/api'
import { authService } from '@/services/authService'
import type { AuthOut, BusinessOut, LoginRequest, RegisterRequest, UserOut } from '@/types/api'

interface AuthState {
  user: UserOut | null
  business: BusinessOut | null
}

const EMPTY: AuthState = { user: null, business: null }

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<AuthState>(EMPTY)
  // Only show the boot spinner when there is a stored session to restore.
  const [isLoading, setIsLoading] = useState<boolean>(() => tokenStorage.hasTokens())

  const applyAuth = useCallback((data: AuthOut) => {
    tokenStorage.setTokens(data.access_token, data.refresh_token)
    setState({ user: data.user, business: data.business })
  }, [])

  const clearSession = useCallback(() => {
    tokenStorage.clear()
    setState(EMPTY)
    queryClient.clear()
  }, [queryClient])

  const refreshMe = useCallback(async () => {
    const me = await authService.me()
    setState({ user: me.user, business: me.business })
  }, [])

  // Boot: restore the session from stored tokens.
  useEffect(() => {
    if (!tokenStorage.hasTokens()) return
    let cancelled = false
    authService
      .me()
      .then((me) => {
        if (!cancelled) setState({ user: me.user, business: me.business })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        // Only a rejected session ends it; a network error or 5xx (e.g. a backend restart) keeps the
        // stored tokens so the next reload restores the session.
        if (getErrorStatus(err) === 401) tokenStorage.clear()
        setState(EMPTY)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // React to the API client's refresh / forced-logout events.
  useEffect(() => {
    const onLogout = () => clearSession()
    const onRefreshed = (event: Event) => {
      const detail = (event as CustomEvent<AuthOut>).detail
      if (detail?.user && detail.business) setState({ user: detail.user, business: detail.business })
    }
    window.addEventListener(AUTH_LOGOUT_EVENT, onLogout)
    window.addEventListener(AUTH_REFRESHED_EVENT, onRefreshed)
    return () => {
      window.removeEventListener(AUTH_LOGOUT_EVENT, onLogout)
      window.removeEventListener(AUTH_REFRESHED_EVENT, onRefreshed)
    }
  }, [clearSession])

  const login = useCallback(
    async (data: LoginRequest) => {
      applyAuth(await authService.login(data))
    },
    [applyAuth],
  )

  const register = useCallback(
    async (data: RegisterRequest) => {
      applyAuth(await authService.register(data))
    },
    [applyAuth],
  )

  const logout = useCallback(async () => {
    const refreshToken = tokenStorage.getRefreshToken()
    try {
      if (refreshToken) await authService.logout(refreshToken)
    } catch {
      // Logout is best-effort; the local session is cleared regardless.
    } finally {
      clearSession()
    }
  }, [clearSession])

  const setBusiness = useCallback((business: BusinessOut) => {
    setState((prev) => ({ ...prev, business }))
  }, [])

  const setUser = useCallback((user: UserOut) => {
    setState((prev) => ({ ...prev, user }))
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user: state.user,
      business: state.business,
      isLoading,
      isAuthenticated: state.user !== null,
      login,
      register,
      logout,
      refreshMe,
      setBusiness,
      setUser,
    }),
    [state, isLoading, login, register, logout, refreshMe, setBusiness, setUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
