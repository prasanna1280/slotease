/**
 * Validate a `?next=` redirect target. Only same-origin absolute paths are allowed
 * (prevents open redirects such as `//evil.com` or `https://evil.com`).
 */
export function safeNextPath(next: string | null | undefined, fallback = '/app'): string {
  if (!next) return fallback
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback
  return next
}
