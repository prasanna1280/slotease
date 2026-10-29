/**
 * Pure helpers for the week time-grid: visible hour range, block positions (percent of the
 * day column) and side-by-side lanes for overlapping blocks (e.g. a cancelled booking under a new one).
 */
import { hhmmToMinutes, minutesSinceMidnight } from '@/lib/datetime'
import type { AppointmentOut, WorkingHoursOut } from '@/types/api'

export interface GridRange {
  /** Minutes since midnight of the first visible hour (multiple of 60). */
  startMin: number
  /** Minutes since midnight of the end of the last visible hour (multiple of 60). */
  endMin: number
}

export const DEFAULT_GRID_RANGE: GridRange = { startMin: 8 * 60, endMin: 20 * 60 }
const DAY_MIN = 24 * 60
/** Minimum block height in minutes so very short appointments stay clickable. */
const MIN_BLOCK_MIN = 15

const floorHour = (m: number) => Math.floor(m / 60) * 60
const ceilHour = (m: number) => Math.ceil(m / 60) * 60

/** Start / end minutes of an appointment in the business timezone; an end at midnight counts as 24:00. */
export function appointmentMinutes(a: Pick<AppointmentOut, 'start_time' | 'end_time'>, tz: string): [number, number] {
  const start = minutesSinceMidnight(a.start_time, tz)
  let end = minutesSinceMidnight(a.end_time, tz)
  if (end <= start) end = DAY_MIN
  return [start, end]
}

/**
 * Hour range spanning the earliest opening to the latest closing across the week (default 08:00–20:00
 * when there are no hours), widened to include any appointment that falls outside it.
 */
export function computeGridRange(
  hours: readonly Pick<WorkingHoursOut, 'open_time' | 'close_time'>[] | undefined,
  appointments: readonly Pick<AppointmentOut, 'start_time' | 'end_time'>[],
  tz: string,
): GridRange {
  let start = Number.POSITIVE_INFINITY
  let end = Number.NEGATIVE_INFINITY
  for (const h of hours ?? []) {
    start = Math.min(start, hhmmToMinutes(h.open_time))
    end = Math.max(end, hhmmToMinutes(h.close_time))
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    start = DEFAULT_GRID_RANGE.startMin
    end = DEFAULT_GRID_RANGE.endMin
  }
  for (const a of appointments) {
    const [s, e] = appointmentMinutes(a, tz)
    start = Math.min(start, s)
    end = Math.max(end, e)
  }
  const startMin = Math.max(0, floorHour(start))
  const endMin = Math.min(DAY_MIN, Math.max(ceilHour(end), startMin + 60))
  return { startMin, endMin }
}

/** Top offset and height as percentages of the visible range, clamped to the grid. */
export function positionBlock(startMin: number, endMin: number, range: GridRange): { top: number; height: number } {
  const span = range.endMin - range.startMin
  const s = Math.min(Math.max(startMin, range.startMin), range.endMin)
  const e = Math.min(Math.max(endMin, s + MIN_BLOCK_MIN), range.endMin)
  return { top: round(((s - range.startMin) / span) * 100), height: round(((e - s) / span) * 100) }
}

/** Percentage offset of a minute value (e.g. the current-time line); null if outside the grid. */
export function offsetPercent(minute: number, range: GridRange): number | null {
  if (minute < range.startMin || minute > range.endMin) return null
  return round(((minute - range.startMin) / (range.endMin - range.startMin)) * 100)
}

export interface PositionedBlock {
  appointment: AppointmentOut
  startMin: number
  endMin: number
  top: number
  height: number
  /** 0-based lane within its overlap cluster. */
  lane: number
  /** Number of lanes in its overlap cluster (block width = 100 / lanes %). */
  lanes: number
}

/** Position one day's appointments, splitting overlapping ones into side-by-side lanes. */
export function layoutDay(appointments: readonly AppointmentOut[], tz: string, range: GridRange): PositionedBlock[] {
  const items = appointments
    .map((appointment) => {
      const [startMin, endMin] = appointmentMinutes(appointment, tz)
      return { appointment, startMin, endMin }
    })
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)

  const result: PositionedBlock[] = []
  let cluster: PositionedBlock[] = []
  let laneEnds: number[] = []
  let clusterEnd = Number.NEGATIVE_INFINITY

  const flush = () => {
    for (const block of cluster) block.lanes = laneEnds.length
    result.push(...cluster)
    cluster = []
    laneEnds = []
  }

  for (const item of items) {
    if (item.startMin >= clusterEnd) {
      flush()
      clusterEnd = item.endMin
    } else {
      clusterEnd = Math.max(clusterEnd, item.endMin)
    }
    let lane = laneEnds.findIndex((end) => end <= item.startMin)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(item.endMin)
    } else {
      laneEnds[lane] = item.endMin
    }
    cluster.push({ ...item, ...positionBlock(item.startMin, item.endMin, range), lane, lanes: 1 })
  }
  flush()
  return result
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000
}
