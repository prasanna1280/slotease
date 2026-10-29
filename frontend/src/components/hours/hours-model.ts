/**
 * Working-hours editor model and validation. Validation mirrors the backend's PUT /working-hours
 * rules: open < close, no overlapping ranges on the same day, at most 4 ranges per day.
 */
import { hhmmToMinutes, minutesToHhmm } from '@/lib/datetime'
import type { Weekday, WorkingHoursOut, WorkingHoursRange } from '@/types/api'

export const MAX_RANGES_PER_DAY = 4
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const DEFAULT_RANGE = { open: '09:00', close: '18:00' } as const
const WEEKDAYS: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6]

export interface TimeRange {
  /** Stable React key. */
  key: string
  open: string
  close: string
}

export interface DayHours {
  weekday: Weekday
  enabled: boolean
  ranges: TimeRange[]
}

export interface DayErrors {
  /** Problem with the day as a whole (e.g. too many ranges). */
  day?: string
  /** Error per range index. */
  ranges: Array<string | undefined>
}

export type HoursErrors = Record<Weekday, DayErrors>

let keySeq = 0
export function rangeKey(): string {
  keySeq += 1
  return `r${keySeq}`
}

function makeRange(open: string, close: string): TimeRange {
  return { key: rangeKey(), open, close }
}

/** Build the 7-day editor state from the API rows (closed days get a 09:00–18:00 template). */
export function hoursFromApi(rows: readonly WorkingHoursOut[]): DayHours[] {
  return WEEKDAYS.map((weekday) => {
    const dayRows = rows
      .filter((r) => r.weekday === weekday)
      .sort((a, b) => hhmmToMinutes(a.open_time) - hhmmToMinutes(b.open_time))
    return dayRows.length > 0
      ? { weekday, enabled: true, ranges: dayRows.map((r) => makeRange(r.open_time, r.close_time)) }
      : { weekday, enabled: false, ranges: [makeRange(DEFAULT_RANGE.open, DEFAULT_RANGE.close)] }
  })
}

/** Payload for PUT /working-hours (closed days are omitted). */
export function hoursToApi(days: readonly DayHours[]): WorkingHoursRange[] {
  return days.flatMap((d) =>
    d.enabled
      ? [...d.ranges]
          .sort((a, b) => hhmmToMinutes(a.open) - hhmmToMinutes(b.open))
          .map((r) => ({ weekday: d.weekday, open_time: r.open, close_time: r.close }))
      : [],
  )
}

/** Canonical string for dirty checks. */
export function hoursSignature(days: readonly DayHours[]): string {
  return JSON.stringify(hoursToApi(days))
}

export function validateHours(days: readonly DayHours[]): { valid: boolean; errors: HoursErrors } {
  const errors = {} as HoursErrors
  let valid = true

  for (const day of days) {
    const dayErrors: DayErrors = { ranges: day.ranges.map(() => undefined) }
    errors[day.weekday] = dayErrors
    if (!day.enabled) continue

    if (day.ranges.length === 0) {
      dayErrors.day = 'Add a time range or mark the day as closed.'
    } else if (day.ranges.length > MAX_RANGES_PER_DAY) {
      dayErrors.day = `At most ${MAX_RANGES_PER_DAY} time ranges per day.`
    }

    day.ranges.forEach((r, i) => {
      if (!HHMM_RE.test(r.open) || !HHMM_RE.test(r.close)) {
        dayErrors.ranges[i] = 'Enter both an opening and a closing time.'
      } else if (hhmmToMinutes(r.open) >= hhmmToMinutes(r.close)) {
        dayErrors.ranges[i] = 'Closing time must be after opening time.'
      }
    })

    const order = day.ranges
      .map((r, i) => ({ i, open: hhmmToMinutes(r.open), close: hhmmToMinutes(r.close) }))
      .filter(({ i }) => dayErrors.ranges[i] === undefined)
      .sort((a, b) => a.open - b.open)
    for (let k = 1; k < order.length; k += 1) {
      const prev = order[k - 1]
      const cur = order[k]
      if (prev && cur && cur.open < prev.close) {
        dayErrors.ranges[cur.i] = 'This range overlaps another one on the same day.'
      }
    }

    if (dayErrors.day || dayErrors.ranges.some(Boolean)) valid = false
  }

  return { valid, errors }
}

/** Copy Monday's open/closed state and ranges to Tuesday–Friday. */
export function copyMondayToWeekdays(days: readonly DayHours[]): DayHours[] {
  const monday = days.find((d) => d.weekday === 0)
  if (!monday) return [...days]
  return days.map((d) =>
    d.weekday >= 1 && d.weekday <= 4
      ? { ...d, enabled: monday.enabled, ranges: monday.ranges.map((r) => makeRange(r.open, r.close)) }
      : d,
  )
}

/**
 * "Add break": split the longest valid range around its middle with a one-hour gap
 * (09:00–18:00 → 09:00–13:00 + 14:00–18:00). If no range is long enough, append a new
 * one-hour range after the last closing time. Returns the day unchanged if neither fits.
 */
export function addBreak(day: DayHours): DayHours {
  if (day.ranges.length >= MAX_RANGES_PER_DAY) return day
  const valid = day.ranges
    .map((r, i) => ({ i, open: hhmmToMinutes(r.open), close: hhmmToMinutes(r.close) }))
    .filter((r) => HHMM_RE.test(day.ranges[r.i]?.open ?? '') && r.close > r.open)
  const longest = [...valid].sort((a, b) => b.close - b.open - (a.close - a.open))[0]

  if (longest && longest.close - longest.open >= 180) {
    const mid = Math.floor((longest.open + longest.close) / 2 / 60) * 60
    const breakStart = Math.max(mid, longest.open + 60)
    const breakEnd = breakStart + 60
    if (breakEnd < longest.close) {
      const ranges = [...day.ranges]
      ranges.splice(
        longest.i,
        1,
        makeRange(minutesToHhmm(longest.open), minutesToHhmm(breakStart)),
        makeRange(minutesToHhmm(breakEnd), minutesToHhmm(longest.close)),
      )
      return { ...day, ranges }
    }
  }

  const lastClose = valid.length > 0 ? Math.max(...valid.map((r) => r.close)) : 9 * 60 - 60
  const start = lastClose + 60
  const end = Math.min(start + 60, 23 * 60 + 59)
  if (end <= start) return day
  return { ...day, ranges: [...day.ranges, makeRange(minutesToHhmm(start), minutesToHhmm(end))] }
}

export function newDefaultRange(): TimeRange {
  return makeRange(DEFAULT_RANGE.open, DEFAULT_RANGE.close)
}
