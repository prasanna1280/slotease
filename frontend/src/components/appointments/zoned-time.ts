/**
 * Build an ISO 8601 timestamp with offset for a wall-clock time in an IANA timezone,
 * e.g. ("2026-10-10", "17:30", "Asia/Kolkata") -> "2026-10-10T17:30:00+05:30".
 * The backend rejects naive datetimes, so owner "custom time" bookings need the business offset.
 */

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Offset (minutes east of UTC) of `tz` at the UTC instant `utcMs`. */
export function tzOffsetMinutes(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs))
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60_000)
}

export function zonedDateTimeToIso(ymd: string, hhmm: string, tz: string): string {
  const [y = 1970, m = 1, d = 1] = ymd.split('-').map(Number)
  const [h = 0, mi = 0] = hhmm.split(':').map(Number)
  const naiveUtc = Date.UTC(y, m - 1, d, h, mi)
  // Two passes settle the offset around DST transitions.
  let offset = tzOffsetMinutes(naiveUtc, tz)
  offset = tzOffsetMinutes(naiveUtc - offset * 60_000, tz)
  const sign = offset < 0 ? '-' : '+'
  const abs = Math.abs(offset)
  return `${ymd}T${pad(h)}:${pad(mi)}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}
