/**
 * Minimal RFC 5545 calendar file generation for "Add to calendar" on the booking confirmation.
 * Times are written in UTC (`YYYYMMDDTHHMMSSZ`) so every calendar app shows the right local time.
 */

export interface IcsEvent {
  /** Globally unique id, e.g. "APT-20261010-0007@slotease.app". */
  uid: string
  title: string
  /** ISO 8601 instants (any offset). */
  start: string | Date
  end: string | Date
  description?: string
  location?: string
  /** Defaults to now. */
  stamp?: Date
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Format an instant as an iCalendar UTC date-time: 20261010T120000Z. */
export function toIcsUtc(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${String(value)}`)
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

/** Escape TEXT values: backslash, semicolon, comma and newlines. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

const encoder = new TextEncoder()

/** Fold a content line to at most 75 octets per line (continuation lines start with a space). */
export function foldIcsLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line
  const out: string[] = []
  let current = ''
  let currentBytes = 0
  for (const ch of line) {
    const bytes = encoder.encode(ch).length
    const limit = out.length === 0 ? 75 : 74 // continuation lines lose one octet to the leading space
    if (currentBytes + bytes > limit) {
      out.push(current)
      current = ''
      currentBytes = 0
    }
    current += ch
    currentBytes += bytes
  }
  out.push(current)
  return out.join('\r\n ')
}

/** Build a complete VCALENDAR document with one VEVENT (CRLF line endings). */
export function buildIcs(event: IcsEvent): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SlotEase//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeIcsText(event.uid)}`,
    `DTSTAMP:${toIcsUtc(event.stamp ?? new Date())}`,
    `DTSTART:${toIcsUtc(event.start)}`,
    `DTEND:${toIcsUtc(event.end)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
  ]
  if (event.description) lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`)
  if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`)
  lines.push('STATUS:CONFIRMED', 'END:VEVENT', 'END:VCALENDAR')
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`
}

/** Trigger a browser download of an .ics file. */
export function downloadIcs(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.ics') ? filename : `${filename}.ics`
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
