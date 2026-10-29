import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { groupSlots } from '@/components/booking/booking-utils'
import BookingPage from '@/pages/BookingPage'
import type { BookingConfirmationOut, PublicBusinessOut, PublicServiceOut, SlotsOut } from '@/types/api'
import { apiError } from './helpers'

const svc = vi.hoisted(() => ({
  getBusiness: vi.fn(),
  listServices: vi.fn(),
  getSlots: vi.fn(),
  createBooking: vi.fn(),
}))

vi.mock('@/services/publicService', () => ({ publicService: svc }))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ isAuthenticated: false, isLoading: false, user: null, business: null }),
}))

const BUSINESS: PublicBusinessOut = {
  name: 'Glow Salon',
  slug: 'glow-salon',
  phone: '+919876543210',
  address: '12 MG Road, Chennai',
  timezone: 'Asia/Kolkata',
  currency: 'INR',
  booking_window_days: 60,
  is_bookable: true,
}

const SERVICES: PublicServiceOut[] = [
  { id: 1, name: 'Haircut + Beard', description: 'Cut and beard trim', duration_min: 45, price: '450.00' },
  { id: 2, name: 'Facial', description: null, duration_min: 60, price: '1200.00' },
]

function slotsFor(date: string): SlotsOut {
  return {
    date,
    timezone: 'Asia/Kolkata',
    service_id: 1,
    duration_min: 45,
    slots: [
      { start_time: `${date}T10:00:00+05:30`, end_time: `${date}T10:45:00+05:30`, label: '10:00' },
      { start_time: `${date}T14:00:00+05:30`, end_time: `${date}T14:45:00+05:30`, label: '14:00' },
      { start_time: `${date}T17:30:00+05:30`, end_time: `${date}T18:15:00+05:30`, label: '17:30' },
    ],
  }
}

function renderBooking(path = '/glow-salon') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/book/:slug" element={<BookingPage />} />
          <Route path="/:slug" element={<BookingPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function reachDetailsStep(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /Haircut \+ Beard/ }))
  expect(await screen.findByRole('heading', { name: 'Pick a date and time' })).toHaveFocus()

  await user.click(await screen.findByRole('button', { name: '5:30 PM' }))
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  expect(await screen.findByRole('heading', { name: 'Your details' })).toBeInTheDocument()

  await user.type(screen.getByLabelText('Full name'), 'Karthik S')
  await user.type(screen.getByLabelText('Mobile number'), '+91 98765 43210')
}

beforeEach(() => {
  svc.getBusiness.mockReset().mockResolvedValue(BUSINESS)
  svc.listServices.mockReset().mockResolvedValue(SERVICES)
  svc.getSlots.mockReset().mockImplementation((_slug: string, q: { date: string }) => Promise.resolve(slotsFor(q.date)))
  svc.createBooking.mockReset()
})

describe('BookingPage', () => {
  it('books an appointment end to end', async () => {
    const user = userEvent.setup()
    renderBooking('/book/glow-salon')

    expect(await screen.findByRole('heading', { level: 1, name: 'Glow Salon' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Call/ })).toHaveAttribute('href', 'tel:+919876543210')

    await reachDetailsStep(user)

    // Slots are grouped by time of day in the business timezone.
    expect(svc.getSlots).toHaveBeenCalledWith('glow-salon', expect.objectContaining({ service_id: 1 }))

    const date = (svc.getSlots.mock.calls[0]?.[1] as { date: string }).date
    const confirmation: BookingConfirmationOut = {
      booking_id: 'APT-20261010-0007',
      service: 'Haircut + Beard',
      start_time: `${date}T17:30:00+05:30`,
      end_time: `${date}T18:15:00+05:30`,
      status: 'booked',
      message: 'Booking confirmed at Glow Salon, Sat 10 Oct, 5:30 PM',
      business_name: 'Glow Salon',
      customer_name: 'Karthik S',
      price: '450.00',
    }
    svc.createBooking.mockResolvedValueOnce(confirmation)

    await user.click(screen.getByRole('button', { name: 'Confirm booking' }))

    expect(await screen.findByRole('heading', { name: "You're booked!" })).toBeInTheDocument()
    expect(svc.createBooking).toHaveBeenCalledWith('glow-salon', {
      service_id: 1,
      start_time: `${date}T17:30:00+05:30`,
      customer_name: 'Karthik S',
      customer_phone: '+91 98765 43210',
      customer_email: null,
      notes: null,
    })
    expect(screen.getByText('APT-20261010-0007')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy booking ID' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add to calendar/ })).toBeInTheDocument()

    // Customer details are remembered for the next booking on this device.
    expect(JSON.parse(window.localStorage.getItem('slotease.booking.customer') ?? '{}')).toMatchObject({
      customer_name: 'Karthik S',
      customer_phone: '+91 98765 43210',
    })

    await user.click(screen.getByRole('button', { name: 'Book another appointment' }))
    expect(await screen.findByRole('heading', { name: 'Choose a service' })).toBeInTheDocument()
  })

  it('handles SLOT_TAKEN by returning to the time step and refetching slots', async () => {
    const user = userEvent.setup()
    renderBooking()
    await reachDetailsStep(user)

    svc.createBooking.mockRejectedValueOnce(
      apiError(409, { error: 'SLOT_TAKEN', message: 'This slot was just booked. Please pick another time.' }),
    )
    const slotCallsBefore = svc.getSlots.mock.calls.length

    await user.click(screen.getByRole('button', { name: 'Confirm booking' }))

    const heading = await screen.findByRole('heading', { name: 'Pick a date and time' })
    expect(heading).toHaveFocus()
    const alert = screen.getByRole('alert')
    expect(within(alert).getByText('This slot was just booked. Please pick another time.')).toBeInTheDocument()
    await waitFor(() => expect(svc.getSlots.mock.calls.length).toBeGreaterThan(slotCallsBefore))

    // The taken slot is no longer selected; Continue is disabled until a new time is picked.
    expect(await screen.findByRole('button', { name: '5:30 PM' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()

    // Details typed earlier are kept.
    await user.click(screen.getByRole('button', { name: '10:00 AM' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByLabelText('Full name')).toHaveValue('Karthik S')
  })

  it('shows a friendly page when the business is not found', async () => {
    svc.getBusiness.mockRejectedValueOnce(apiError(404, { error: 'BUSINESS_NOT_FOUND', message: 'Not found' }))
    renderBooking('/no-such-place')
    expect(await screen.findByRole('heading', { name: 'Booking page not found' })).toBeInTheDocument()
  })

  it('shows a call-to-book page when the business is not bookable', async () => {
    svc.getBusiness.mockResolvedValueOnce({ ...BUSINESS, is_bookable: false })
    renderBooking()
    expect(await screen.findByRole('heading', { name: 'Online booking is paused' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Call/ })).toHaveAttribute('href', 'tel:+919876543210')
  })

  it('shows an empty state when there are no free slots', async () => {
    const user = userEvent.setup()
    svc.getSlots.mockImplementation((_slug: string, q: { date: string }) =>
      Promise.resolve({ ...slotsFor(q.date), slots: [] }),
    )
    renderBooking()
    await user.click(await screen.findByRole('button', { name: /Facial/ }))
    expect(await screen.findByText('No free slots on this day')).toBeInTheDocument()
  })
})

describe('groupSlots', () => {
  it('groups by morning, afternoon and evening', () => {
    const groups = groupSlots(slotsFor('2026-10-10').slots, 'Asia/Kolkata')
    expect(groups.map((g) => [g.label, g.slots.length])).toEqual([
      ['Morning', 1],
      ['Afternoon', 1],
      ['Evening', 1],
    ])
  })
})
