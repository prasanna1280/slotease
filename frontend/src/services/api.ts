import axios, { AxiosHeaders, type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { tokenStorage } from '@/lib/tokenStorage'
import type { AuthOut } from '@/types/api'

/** Empty VITE_API_URL = same origin (nginx / Vite dev server proxy `/api`). */
export const API_BASE_URL = `${import.meta.env.VITE_API_URL ?? ''}/api/v1`

/** Fired on `window` when the session cannot be refreshed; AuthContext listens and signs out. */
export const AUTH_LOGOUT_EVENT = 'auth:logout'

/** Fired on `window` after a successful silent refresh, with the new AuthOut as `detail`. */
export const AUTH_REFRESHED_EVENT = 'auth:refreshed'

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20_000,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
})

/** Endpoints whose 401 means "bad credentials", not "expired session". */
const NO_REFRESH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh']

function isNoRefreshPath(url: string | undefined): boolean {
  if (!url) return false
  return NO_REFRESH_PATHS.some((p) => url.includes(p))
}

api.interceptors.request.use((config) => {
  const token = tokenStorage.getAccessToken()
  if (token) {
    const headers = AxiosHeaders.from(config.headers)
    headers.set('Authorization', `Bearer ${token}`)
    config.headers = headers
  }
  return config
})

/** Single-flight refresh: concurrent 401s share one refresh request. */
let refreshPromise: Promise<string | null> | null = null

async function performRefresh(): Promise<string | null> {
  const refreshToken = tokenStorage.getRefreshToken()
  if (!refreshToken) return null
  try {
    // Bare axios call so this request never goes through the interceptors below.
    const { data } = await axios.post<AuthOut>(
      `${API_BASE_URL}/auth/refresh`,
      { refresh_token: refreshToken },
      { headers: { 'Content-Type': 'application/json' }, timeout: 20_000 },
    )
    tokenStorage.setTokens(data.access_token, data.refresh_token)
    window.dispatchEvent(new CustomEvent<AuthOut>(AUTH_REFRESHED_EVENT, { detail: data }))
    return data.access_token
  } catch {
    return null
  }
}

/** Refresh the access token once, sharing the in-flight request between callers. */
export function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean }

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined
    const status = error.response?.status

    if (status !== 401 || !original || original._retried || isNoRefreshPath(original.url)) {
      return Promise.reject(error)
    }

    original._retried = true
    const newToken = await refreshAccessToken()

    if (!newToken) {
      tokenStorage.clear()
      window.dispatchEvent(new Event(AUTH_LOGOUT_EVENT))
      return Promise.reject(error)
    }

    const headers = AxiosHeaders.from(original.headers)
    headers.set('Authorization', `Bearer ${newToken}`)
    original.headers = headers
    return api(original)
  },
)
