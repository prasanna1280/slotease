import { useEffect, useState } from 'react'
import type { AppointmentStatus } from '@/types/api'

/**
 * Calendar block colours: a solid status bar (same hues as APPOINTMENT_STATUS_DOT) on a light tint
 * with dark text, which keeps WCAG AA contrast at small sizes.
 */
export const CALENDAR_BLOCK_CLASSES: Record<AppointmentStatus, string> = {
  booked: 'border-l-blue-600 bg-blue-50 text-blue-950 hover:bg-blue-100',
  completed: 'border-l-green-600 bg-green-50 text-green-950 hover:bg-green-100',
  no_show: 'border-l-amber-500 bg-amber-50 text-amber-950 hover:bg-amber-100',
  cancelled: 'border-l-slate-400 bg-slate-50 text-slate-600 hover:bg-slate-100',
}

/** Current time, refreshed every `intervalMs` (for the "now" line). */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}
