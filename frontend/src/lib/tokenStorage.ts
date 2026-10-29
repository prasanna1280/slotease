/**
 * Persists the JWT pair in localStorage. Every access is wrapped in try/catch because storage can
 * throw (Safari private mode, blocked site data); in that case tokens live in memory for the session.
 *
 * localStorage is the source of truth whenever it works, so every tab sees the latest rotated pair.
 * (Preferring a per-tab memory copy would make a tab present an already-rotated refresh token,
 * which the API treats as token reuse and answers by revoking every session.)
 *
 * A SlotEase admin's read-only "view as owner" session lives in sessionStorage instead: it belongs to
 * one tab only, has no refresh token, and never reads or overwrites the owner tokens in localStorage.
 */

const ACCESS_KEY = 'slotease.access_token'
const REFRESH_KEY = 'slotease.refresh_token'
const VIEW_AS_KEY = 'slotease.view_as'

/** A read-only "view as owner" session opened from the admin panel. */
export interface ViewAsSession {
  token: string
  business: string
  owner: string
  /** Unix seconds. */
  expiresAt: number
}

const memory: { access: string | null; refresh: string | null } = { access: null, refresh: null }
let storageAvailable = true
let memoryViewAs: ViewAsSession | null = null

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

function isViewAs(value: unknown): value is ViewAsSession {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.token === 'string' &&
    typeof v.business === 'string' &&
    typeof v.owner === 'string' &&
    typeof v.expiresAt === 'number'
  )
}

function readViewAs(): ViewAsSession | null {
  try {
    const raw = window.sessionStorage.getItem(VIEW_AS_KEY)
    if (raw === null) return memoryViewAs
    const parsed: unknown = JSON.parse(raw)
    return isViewAs(parsed) ? parsed : null
  } catch {
    return memoryViewAs
  }
}

function writeViewAs(session: ViewAsSession | null): void {
  memoryViewAs = session
  try {
    if (session === null) window.sessionStorage.removeItem(VIEW_AS_KEY)
    else window.sessionStorage.setItem(VIEW_AS_KEY, JSON.stringify(session))
  } catch {
    // Kept in memory for this page.
  }
}

export const tokenStorage = {
  getAccessToken(): string | null {
    const viewAs = readViewAs()
    if (viewAs) return viewAs.token
    return storageAvailable ? read(ACCESS_KEY) : memory.access
  },
  getRefreshToken(): string | null {
    if (readViewAs()) return null
    return storageAvailable ? read(REFRESH_KEY) : memory.refresh
  },
  setTokens(accessToken: string, refreshToken: string): void {
    // A real sign-in in this tab ends any view-as session here.
    writeViewAs(null)
    memory.access = accessToken
    memory.refresh = refreshToken
    const accessSaved = write(ACCESS_KEY, accessToken)
    const refreshSaved = write(REFRESH_KEY, refreshToken)
    storageAvailable = accessSaved && refreshSaved
  },
  clear(): void {
    // Ending a view-as session must not sign this browser's own owner account out.
    if (readViewAs()) {
      writeViewAs(null)
      return
    }
    memory.access = null
    memory.refresh = null
    write(ACCESS_KEY, null)
    write(REFRESH_KEY, null)
  },
  hasTokens(): boolean {
    return Boolean(this.getAccessToken() || this.getRefreshToken())
  },
  /** Start a read-only "view as owner" session in this tab only. */
  startViewAs(session: ViewAsSession): void {
    writeViewAs(session)
  },
  /** The current tab's "view as owner" session, if any. */
  viewAs(): ViewAsSession | null {
    return readViewAs()
  },
}
