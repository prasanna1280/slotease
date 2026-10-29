/**
 * Persists the JWT pair in localStorage. Every access is wrapped in try/catch because storage can
 * throw (Safari private mode, blocked site data); in that case tokens live in memory for the session.
 *
 * localStorage is the source of truth whenever it works, so every tab sees the latest rotated pair.
 * (Preferring a per-tab memory copy would make a tab present an already-rotated refresh token,
 * which the API treats as token reuse and answers by revoking every session.)
 */

const ACCESS_KEY = 'slotease.access_token'
const REFRESH_KEY = 'slotease.refresh_token'

const memory: { access: string | null; refresh: string | null } = { access: null, refresh: null }
let storageAvailable = true

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Returns false when storage is unavailable (the in-memory copy is used instead). */
function write(key: string, value: string | null): boolean {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export const tokenStorage = {
  getAccessToken(): string | null {
    return storageAvailable ? read(ACCESS_KEY) : memory.access
  },
  getRefreshToken(): string | null {
    return storageAvailable ? read(REFRESH_KEY) : memory.refresh
  },
  setTokens(accessToken: string, refreshToken: string): void {
    memory.access = accessToken
    memory.refresh = refreshToken
    const accessSaved = write(ACCESS_KEY, accessToken)
    const refreshSaved = write(REFRESH_KEY, refreshToken)
    storageAvailable = accessSaved && refreshSaved
  },
  clear(): void {
    memory.access = null
    memory.refresh = null
    write(ACCESS_KEY, null)
    write(REFRESH_KEY, null)
  },
  hasTokens(): boolean {
    return Boolean(this.getAccessToken() || this.getRefreshToken())
  },
}
