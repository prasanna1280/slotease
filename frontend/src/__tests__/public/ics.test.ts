import { describe, expect, it } from 'vitest'
import { buildIcs, escapeIcsText, foldIcsLine, toIcsUtc } from '@/lib/ics'

describe('ics generation', () => {
  it('converts offset times to UTC', () => {
    expect(toIcsUtc('2026-10-10T17:30:00+05:30')).toBe('20261010T120000Z')
    expect(toIcsUtc('2026-03-29T01:30:00+01:00')).toBe('20260329T003000Z')
  })

  it('escapes TEXT values', () => {
    expect(escapeIcsText('Cut, colour; spa\\ day\nLine 2')).toBe('Cut\\, colour\\; spa\\\\ day\\nLine 2')
  })

  it('builds a valid single-event calendar', () => {
    const ics = buildIcs({
      uid: 'APT-20261010-0007@slotease.app',
      title: 'Haircut + Beard at Glow Salon, Chennai',
      start: '2026-10-10T17:30:00+05:30',
      end: '2026-10-10T18:15:00+05:30',
      description: 'Booking ID: APT-20261010-0007\nCall +91 98765 43210',
      location: '12 MG Road; Chennai',
      stamp: new Date('2026-10-01T00:00:00Z'),
    })

    expect(ics.endsWith('\r\n')).toBe(true)
    const lines = ics.trimEnd().split('\r\n')
    expect(lines[0]).toBe('BEGIN:VCALENDAR')
    expect(lines.at(-1)).toBe('END:VCALENDAR')
    expect(lines).toContain('DTSTART:20261010T120000Z')
    expect(lines).toContain('DTEND:20261010T124500Z')
    expect(lines).toContain('DTSTAMP:20261001T000000Z')
    expect(lines).toContain('UID:APT-20261010-0007@slotease.app')
    expect(lines).toContain('SUMMARY:Haircut + Beard at Glow Salon\\, Chennai')
    expect(lines).toContain('LOCATION:12 MG Road\\; Chennai')
    expect(lines).toContain('DESCRIPTION:Booking ID: APT-20261010-0007\\nCall +91 98765 43210')
    // No bare LF line breaks.
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n')
  })

  it('folds long lines to 75 octets', () => {
    const long = `DESCRIPTION:${'a'.repeat(200)}`
    const folded = foldIcsLine(long)
    const parts = folded.split('\r\n')
    expect(parts.length).toBeGreaterThan(1)
    for (const p of parts) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75)
    expect(parts.slice(1).every((p) => p.startsWith(' '))).toBe(true)
    expect(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join('')).toBe(long)
  })
})
