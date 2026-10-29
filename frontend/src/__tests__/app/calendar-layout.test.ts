import { describe, expect, it } from 'vitest'
import {
  computeGridRange,
  DEFAULT_GRID_RANGE,
  layoutDay,
  offsetPercent,
  positionBlock,
} from '@/components/calendar/calendar-layout'
import type { AppointmentOut, AppointmentStatus } from '@/types/api'

const TZ = 'Asia/Kolkata'

function appt(id: number, start: string, end: string, status: AppointmentStatus = 'booked'): AppointmentOut {
  return {
    id,
    reference: null,
    service_id: 1,
    service_name: 'Haircut',
    duration_min: 30,
    customer_id: 1,
    customer_name: `Customer ${id}`,
    customer_phone: '+919876543210',
    customer_email: null,
    start_time: `2026-10-10T${start}:00+05:30`,
    end_time: `2026-10-10T${end}:00+05:30`,
    status,
    price: '300.00',
    notes: null,
    source: 'online',
    created_at: '2026-10-01T10:00:00+05:30',
  }
}

describe('computeGridRange', () => {
  it('defaults to 08:00-20:00 without hours or appointments', () => {
    expect(computeGridRange(undefined, [], TZ)).toEqual(DEFAULT_GRID_RANGE)
  })

  it('spans the earliest open to the latest close, rounded to whole hours', () => {
    const hours = [
      { open_time: '09:30', close_time: '13:00' },
      { open_time: '14:00', close_time: '18:15' },
    ]
    expect(computeGridRange(hours, [], TZ)).toEqual({ startMin: 9 * 60, endMin: 19 * 60 })
  })

  it('widens to include appointments outside working hours (in the business timezone)', () => {
    const hours = [{ open_time: '09:00', close_time: '18:00' }]
    const range = computeGridRange(hours, [appt(1, '07:15', '07:45'), appt(2, '19:30', '20:10')], TZ)
    expect(range).toEqual({ startMin: 7 * 60, endMin: 21 * 60 })
  })
})

describe('positionBlock', () => {
  const range = { startMin: 8 * 60, endMin: 20 * 60 } // 720 minutes

  it('positions by minutes since the grid start as percentages', () => {
    // 11:00-12:00 -> top 180/720 = 25%, height 60/720 = 8.333%
    expect(positionBlock(11 * 60, 12 * 60, range)).toEqual({ top: 25, height: 8.333 })
  })

  it('gives very short blocks a 15-minute minimum height', () => {
    expect(positionBlock(8 * 60, 8 * 60 + 5, range).height).toBeCloseTo((15 / 720) * 100, 2)
  })

  it('clamps blocks to the visible range', () => {
    expect(positionBlock(19 * 60 + 30, 21 * 60, range)).toEqual({ top: 95.833, height: 4.167 })
  })
})

describe('offsetPercent', () => {
  it('returns null outside the grid', () => {
    const range = { startMin: 480, endMin: 1200 }
    expect(offsetPercent(420, range)).toBeNull()
    expect(offsetPercent(840, range)).toBe(50)
  })
})

describe('layoutDay', () => {
  const range = { startMin: 8 * 60, endMin: 20 * 60 }

  it('puts non-overlapping appointments in a single lane', () => {
    const blocks = layoutDay([appt(2, '11:00', '11:30'), appt(1, '10:00', '10:30')], TZ, range)
    expect(blocks.map((b) => b.appointment.id)).toEqual([1, 2])
    expect(blocks.every((b) => b.lane === 0 && b.lanes === 1)).toBe(true)
    expect(blocks[0]?.top).toBeCloseTo((120 / 720) * 100, 2)
  })

  it('splits overlapping appointments into side-by-side lanes', () => {
    const blocks = layoutDay(
      [appt(1, '10:00', '11:00', 'cancelled'), appt(2, '10:00', '10:30'), appt(3, '10:30', '11:00'), appt(4, '12:00', '12:30')],
      TZ,
      range,
    )
    const byId = new Map(blocks.map((b) => [b.appointment.id, b]))
    expect(byId.get(1)?.lanes).toBe(2)
    expect(byId.get(2)?.lanes).toBe(2)
    expect(byId.get(3)?.lanes).toBe(2)
    expect(new Set([byId.get(1)?.lane, byId.get(2)?.lane])).toEqual(new Set([0, 1]))
    // 10:30 reuses the lane freed by the 10:00-10:30 block.
    expect(byId.get(3)?.lane).toBe(byId.get(2)?.lane)
    expect(byId.get(4)).toMatchObject({ lane: 0, lanes: 1 })
  })
})
