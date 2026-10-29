import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { addDays, formatDate, formatTime, startOfWeek, todayInTz, weekdayName } from '@/lib/datetime'
import { formatMoney } from '@/lib/money'
import { safeNextPath } from '@/lib/navigation'

describe('Button', () => {
  it('renders and handles clicks', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Save changes</Button>)
    const button = screen.getByRole('button', { name: 'Save changes' })
    expect(button).toHaveAttribute('type', 'button')
    await userEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('is disabled and busy while loading', () => {
    render(<Button loading>Saving</Button>)
    const button = screen.getByRole('button', { name: 'Saving' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })
})

describe('StatusBadge', () => {
  it.each([
    ['booked', 'Booked', 'bg-blue-50'],
    ['completed', 'Completed', 'bg-green-50'],
    ['no_show', 'No-show', 'bg-amber-50'],
    ['cancelled', 'Cancelled', 'bg-slate-100'],
  ] as const)('renders %s with the right label and colour', (status, label, colour) => {
    render(<StatusBadge status={status} />)
    const badge = screen.getByText(label)
    expect(badge).toBeInTheDocument()
    expect(badge.className).toContain(colour)
  })
})

describe('formatting helpers', () => {
  it('formats times and dates in the business timezone', () => {
    const iso = '2026-10-10T17:30:00+05:30'
    expect(formatTime(iso, 'Asia/Kolkata')).toBe('5:30 PM')
    expect(formatDate(iso, 'Asia/Kolkata')).toBe('Sat, 10 Oct 2026')
    expect(formatDate('2026-10-10')).toBe('Sat, 10 Oct 2026')
  })

  it('does calendar-date arithmetic', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(startOfWeek('2026-10-10')).toBe('2026-10-05')
    expect(weekdayName(0)).toBe('Monday')
    expect(todayInTz('Asia/Kolkata')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('formats money in INR', () => {
    expect(formatMoney('6450.00')).toBe('₹6,450')
    expect(formatMoney('99.5')).toBe('₹99.50')
  })

  it('only allows same-origin next paths', () => {
    expect(safeNextPath('/app/calendar')).toBe('/app/calendar')
    expect(safeNextPath('//evil.com')).toBe('/app')
    expect(safeNextPath('https://evil.com')).toBe('/app')
  })
})
