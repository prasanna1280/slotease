/**
 * Date/time helpers. All formatting goes through Intl.DateTimeFormat with an explicit
 * IANA `timeZone` so values render in the business timezone, not the viewer's.
 *
 * "ymd" strings are calendar dates (YYYY-MM-DD) with no timezone attached.
 */

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
const WEEKDAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const LOCALE = 'en-US'

const dtfCache = new Map<string, Intl.DateTimeFormat>()

function dtf(timeZone: string | undefined, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${timeZone ?? ''}|${JSON.stringify(options)}`
  let f = dtfCache.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(LOCALE, { ...options, ...(timeZone ? { timeZone } : {}) })
    dtfCache.set(key, f)
  }
  return f
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function partsOf(f: Intl.DateTimeFormat, d: Date): (type: Intl.DateTimeFormatPartTypes) => string {
  const parts = f.formatToParts(d)
  return (type) => parts.find((p) => p.type === type)?.value ?? ''
}

/** True if the string is a calendar date (YYYY-MM-DD). */
export function isYmd(value: string): boolean {
  return YMD_RE.test(value)
}

/** Parse YYYY-MM-DD into a Date at 12:00 UTC (safe from offset / DST day shifts). */
export function ymdToDate(ymd: string): Date {
  const m = YMD_RE.exec(ymd)
  if (!m) throw new Error(`Invalid date: ${ymd}`)
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12))
}

function utcDateToYmd(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/**
 * Resolve input to [Date, timeZone]. A bare YYYY-MM-DD is a calendar date (rendered in UTC so the
 * day never shifts); anything else is parsed as an instant and rendered in `tz`.
 */
function resolve(value: string | Date, tz?: string): [Date, string | undefined] {
  if (typeof value === 'string' && isYmd(value)) return [ymdToDate(value), 'UTC']
  return [typeof value === 'string' ? new Date(value) : value, tz]
}

/** "5:30 PM" in the given timezone. */
export function formatTime(iso: string | Date, tz?: string): string {
  const [d, zone] = resolve(iso, tz)
  // Newer ICU versions separate "PM" with a narrow no-break space; normalise to a regular space.
  return dtf(zone, { hour: 'numeric', minute: '2-digit', hour12: true })
    .format(d)
    .replace(/\s+/g, ' ')
}

/** "17:30" (24-hour) in the given timezone. */
export function formatTime24(iso: string | Date, tz?: string): string {
  const [d, zone] = resolve(iso, tz)
  const get = partsOf(dtf(zone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }), d)
  return `${get('hour')}:${get('minute')}`
}

/** "5:30 PM – 6:15 PM". */
export function formatTimeRange(startIso: string, endIso: string, tz?: string): string {
  return `${formatTime(startIso, tz)} – ${formatTime(endIso, tz)}`
}

/** "Sat, 10 Oct 2026". Accepts an ISO instant or a YYYY-MM-DD calendar date. */
export function formatDate(value: string | Date, tz?: string): string {
  const [d, zone] = resolve(value, tz)
  const get = partsOf(dtf(zone, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }), d)
  return `${get('weekday')}, ${get('day')} ${get('month')} ${get('year')}`
}

/** "Sat 10 Oct" — compact day label for headers and chips. */
export function formatDayLabel(value: string | Date, tz?: string): string {
  const [d, zone] = resolve(value, tz)
  const get = partsOf(dtf(zone, { weekday: 'short', day: 'numeric', month: 'short' }), d)
  return `${get('weekday')} ${get('day')} ${get('month')}`
}

/** "Sat 10 Oct, 5:30 PM". */
export function formatDateTime(iso: string | Date, tz?: string): string {
  return `${formatDayLabel(iso, tz)}, ${formatTime(iso, tz)}`
}

/** "October 2026" from "2026-10" or a YYYY-MM-DD. */
export function formatMonth(ym: string): string {
  const ymd = ym.length === 7 ? `${ym}-01` : ym
  return dtf('UTC', { month: 'long', year: 'numeric' }).format(ymdToDate(ymd))
}

/** Calendar date (YYYY-MM-DD) of an instant in the given timezone. */
export function toYmdInTz(value: string | Date, tz?: string): string {
  const d = typeof value === 'string' ? new Date(value) : value
  const get = partsOf(dtf(tz, { year: 'numeric', month: '2-digit', day: '2-digit' }), d)
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Today's date (YYYY-MM-DD) in the given timezone. */
export function todayInTz(tz?: string): string {
  return toYmdInTz(new Date(), tz)
}

/** Current month (YYYY-MM) in the given timezone. */
export function currentMonthInTz(tz?: string): string {
  return todayInTz(tz).slice(0, 7)
}

/** Add n days (may be negative) to a YYYY-MM-DD date. */
export function addDays(ymd: string, n: number): string {
  const d = ymdToDate(ymd)
  d.setUTCDate(d.getUTCDate() + n)
  return utcDateToYmd(d)
}

/** Whole days from a to b (b - a) for two YYYY-MM-DD dates. */
export function diffDays(a: string, b: string): number {
  return Math.round((ymdToDate(b).getTime() - ymdToDate(a).getTime()) / 86_400_000)
}

/** Weekday index of a YYYY-MM-DD date, 0 = Monday … 6 = Sunday (matches the API). */
export function weekdayIndex(ymd: string): number {
  return (ymdToDate(ymd).getUTCDay() + 6) % 7
}

/** Monday of the week containing the given YYYY-MM-DD date. */
export function startOfWeek(ymd: string): string {
  return addDays(ymd, -weekdayIndex(ymd))
}

/** The seven dates (Mon–Sun) of the week containing ymd. */
export function weekDays(ymd: string): string[] {
  const monday = startOfWeek(ymd)
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

/** Weekday name, 0 = Monday … 6 = Sunday. `short` gives "Mon". */
export function weekdayName(i: number, short = false): string {
  const list = short ? WEEKDAYS_SHORT : WEEKDAYS
  return list[((i % 7) + 7) % 7] ?? ''
}

/** Minutes since local midnight of an instant in the given timezone (for calendar positioning). */
export function minutesSinceMidnight(iso: string | Date, tz?: string): number {
  return hhmmToMinutes(formatTime24(iso, tz))
}

/** "09:00" -> 540. */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** 540 -> "09:00". */
export function minutesToHhmm(total: number): string {
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}

/** "9:00 AM" from "09:00". */
export function formatHhmm(hhmm: string): string {
  const mins = hhmmToMinutes(hhmm)
  const h = Math.floor(mins / 60)
  const period = h >= 12 && h < 24 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${pad(mins % 60)} ${period}`
}

/** Whole days remaining until an ISO instant (never negative, rounded up). */
export function daysUntil(iso: string | null | undefined, now: Date = new Date()): number {
  if (!iso) return 0
  const ms = new Date(iso).getTime() - now.getTime()
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000)
}

/** "45 min", "1 h", "1 h 30 min". */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** The browser's IANA timezone, or undefined if unavailable. */
export function browserTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return undefined
  }
}
