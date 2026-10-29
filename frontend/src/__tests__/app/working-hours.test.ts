import { describe, expect, it } from 'vitest'
import {
  addBreak,
  copyMondayToWeekdays,
  hoursFromApi,
  hoursSignature,
  hoursToApi,
  rangeKey,
  validateHours,
  type DayHours,
} from '@/components/hours/hours-model'
import type { Weekday, WorkingHoursOut } from '@/types/api'

const API_ROWS: WorkingHoursOut[] = [
  { id: 1, weekday: 0, open_time: '14:00', close_time: '18:00' },
  { id: 2, weekday: 0, open_time: '09:00', close_time: '13:00' },
  { id: 3, weekday: 5, open_time: '10:00', close_time: '16:00' },
]

function day(weekday: Weekday, ranges: Array<[string, string]>, enabled = true): DayHours {
  return { weekday, enabled, ranges: ranges.map(([open, close]) => ({ key: rangeKey(), open, close })) }
}

function week(overrides: DayHours[]): DayHours[] {
  return ([0, 1, 2, 3, 4, 5, 6] as Weekday[]).map(
    (w) => overrides.find((d) => d.weekday === w) ?? day(w, [['09:00', '18:00']], false),
  )
}

describe('hoursFromApi / hoursToApi', () => {
  it('builds 7 days, sorts ranges and round-trips enabled days only', () => {
    const days = hoursFromApi(API_ROWS)
    expect(days).toHaveLength(7)
    expect(days[0]?.enabled).toBe(true)
    expect(days[0]?.ranges.map((r) => r.open)).toEqual(['09:00', '14:00'])
    expect(days[1]?.enabled).toBe(false)
    expect(hoursToApi(days)).toEqual([
      { weekday: 0, open_time: '09:00', close_time: '13:00' },
      { weekday: 0, open_time: '14:00', close_time: '18:00' },
      { weekday: 5, open_time: '10:00', close_time: '16:00' },
    ])
  })

  it('signature ignores range keys (dirty check)', () => {
    expect(hoursSignature(hoursFromApi(API_ROWS))).toBe(hoursSignature(hoursFromApi(API_ROWS)))
  })
})

describe('validateHours (mirrors backend rules)', () => {
  it('accepts a valid week with a break', () => {
    expect(validateHours(week([day(0, [['09:00', '13:00'], ['14:00', '18:00']])])).valid).toBe(true)
  })

  it('rejects close before or equal to open', () => {
    const { valid, errors } = validateHours(week([day(1, [['18:00', '09:00']]), day(2, [['10:00', '10:00']])]))
    expect(valid).toBe(false)
    expect(errors[1].ranges[0]).toMatch(/after opening/)
    expect(errors[2].ranges[0]).toMatch(/after opening/)
  })

  it('rejects overlapping ranges on the same day but allows touching ones', () => {
    const overlap = validateHours(week([day(0, [['09:00', '13:00'], ['12:30', '18:00']])]))
    expect(overlap.valid).toBe(false)
    expect(overlap.errors[0].ranges[1]).toMatch(/overlaps/)

    const touching = validateHours(week([day(0, [['09:00', '13:00'], ['13:00', '18:00']])]))
    expect(touching.valid).toBe(true)
  })

  it('rejects more than 4 ranges per day and missing times', () => {
    const many = validateHours(
      week([
        day(3, [
          ['08:00', '09:00'],
          ['10:00', '11:00'],
          ['12:00', '13:00'],
          ['14:00', '15:00'],
          ['16:00', '17:00'],
        ]),
      ]),
    )
    expect(many.valid).toBe(false)
    expect(many.errors[3].day).toMatch(/At most 4/)

    const empty = validateHours(week([day(4, [['', '17:00']])]))
    expect(empty.errors[4].ranges[0]).toMatch(/opening and a closing/)
  })

  it('ignores invalid ranges on closed days', () => {
    expect(validateHours(week([day(6, [['18:00', '09:00']], false)])).valid).toBe(true)
  })
})

describe('editor helpers', () => {
  it('copies Monday to Tuesday–Friday only', () => {
    const days = copyMondayToWeekdays(week([day(0, [['08:00', '12:00']]), day(5, [['10:00', '14:00']])]))
    for (const w of [1, 2, 3, 4]) {
      expect(days[w]?.enabled).toBe(true)
      expect(days[w]?.ranges.map((r) => [r.open, r.close])).toEqual([['08:00', '12:00']])
    }
    expect(days[5]?.ranges[0]?.open).toBe('10:00')
    expect(days[6]?.enabled).toBe(false)
  })

  it('adds a break by splitting the longest range', () => {
    const next = addBreak(day(0, [['09:00', '18:00']]))
    expect(next.ranges.map((r) => [r.open, r.close])).toEqual([
      ['09:00', '13:00'],
      ['14:00', '18:00'],
    ])
    expect(validateHours(week([next])).valid).toBe(true)
  })
})
