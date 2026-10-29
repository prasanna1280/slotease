import { createContext } from 'react'
import type { BusinessOut, LoginRequest, RegisterRequest, UserOut } from '@/types/api'

export interface AuthContextValue {
  user: UserOut | null
  business: BusinessOut | null
  /** True while the initial session check (`GET /auth/me`) is in progress. */
  isLoading: boolean
  isAuthenticated: boolean
  login: (data: LoginRequest) => Promise<void>
  register: (data: RegisterRequest) => Promise<void>
  logout: () => Promise<void>
  /** Re-fetch `/auth/me` (e.g. after billing changes). */
  refreshMe: () => Promise<void>
  /** Replace the cached business after `PATCH /business` or billing updates. */
  setBusiness: (business: BusinessOut) => void
  /** Replace the cached user after `PATCH /auth/me`. */
  setUser: (user: UserOut) => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
