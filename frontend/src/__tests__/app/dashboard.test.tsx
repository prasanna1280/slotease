import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthContextValue } from '@/context/auth-context'
import { todayInTz } from '@/lib/datetime'
import DashboardPage from '@/pages/app/DashboardPage'
import { appointmentService } from '@/services/appointmentService'
import { catalogService } from '@/services/catalogService'
import { statsService } from '@/services/statsService'
import type { AppointmentOut, AppointmentStatus, BusinessOut } from '@/types/api'

vi.mock('@/services/appointmentService', () => ({
  appointmentService: {
    listForDay: vi.fn(),
    listRange: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    freeSlots: vi.fn(),
  },
}))
vi.mock('@/services/statsService', () => ({ statsService: { summary: vi.fn(), month: vi.fn() } }))
vi.mock('@/services/catalogService', () => ({
  catalogService: { list: vi.fn(), create: vi.fn(), update: vi.fn(), deactivate: vi.fn() },
}))

const TZ = 'Asia/Kolkata'
const today = todayInTz(TZ)

const business: BusinessOut = {
  id: 1,
  name: 'Glow Salon',
  slug: 'glow-salon',
  phone: '+919876543210',
  email: null,
  address: null,
  timezone: TZ,
  currency: 'INR',
  slot_interval_min: 15,
  booking_window_days: 60,
  min_notice_minutes: 60,
  plan: 'trial',
  subscription_status: 'trialing',
  trial_ends_at: null,
  current_period_end: null,
  is_bookable: true,
  is_suspended: false,
  created_at: '2026-10-01T10:00:00+05:30',
}

let serverStatus: AppointmentStatus = 'booked'

function appointment(): AppointmentOut {
  return {
    id: 7,
    reference: 'APT-20261010-0007',
    service_id: 2,
    service_name: 'Haircut + Beard',
    duration_min: 45,
    customer_id: 5,
    customer_name: 'Karthik S',
    customer_phone: '+919876543210',
    customer_email: null,
    start_time: `${today}T17:30:00+05:30`,
    end_time: `${today}T18:15:00+05:30`,
    status: serverStatus,
    price: '450.00',
    notes: null,
    source: 'online',
    created_at: '2026-10-01T10:00:00+05:30',
  }
}

const auth: AuthContextValue = {
  user: { id: 1, email: 'owner@glow.in', full_name: 'Asha K', role: 'owner', business_id: 1, created_at: '' },
  business,
  isLoading: false,
  isAuthenticated: true,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  refreshMe: vi.fn(),
  setBusiness: vi.fn(),
  setUser: vi.fn(),
}

function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={['/app']}>
          <DashboardPage />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  serverStatus = 'booked'
  vi.mocked(appointmentService.listForDay).mockImplementation(async () => [appointment()])
  vi.mocked(statsService.summary).mockResolvedValue({
    date: today,
    total: 1,
    booked: 1,
    completed: 0,
    cancelled: 0,
    no_shows: 0,
    revenue_estimate: '450.00',
    next_appointment: null,
  })
  vi.mocked(statsService.month).mockResolvedValue({
    month: today.slice(0, 7),
    total_bookings: 214,
    booked: 20,
    completed: 170,
    cancelled: 11,
    no_shows: 13,
    no_show_rate: 6.1,
    revenue_estimate: '64150.00',
    busiest_day: 'Saturday',
    new_customers: 37,
    daily: [],
    top_services: [],
  })
  vi.mocked(catalogService.list).mockResolvedValue([
    {
      id: 2,
      name: 'Haircut + Beard',
      description: null,
      duration_min: 45,
      price: '450.00',
      is_active: true,
      created_at: '',
    },
  ])
})

describe('DashboardPage', () => {
  it('lists the day with stats, time in the business timezone and the month strip', async () => {
    renderDashboard()
    expect((await screen.findAllByText('Karthik S')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('5:30 PM').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Booked').length).toBeGreaterThan(0)
    expect(await screen.findByText('₹450', { selector: 'p' })).toBeInTheDocument()
    expect(await screen.findByText(/214 bookings/)).toBeInTheDocument()
    expect(screen.getByText(/Busiest day: Saturday/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Today, /)
  })

  it('marks an appointment completed with one click (optimistic)', async () => {
    let resolveUpdate: (a: AppointmentOut) => void = () => undefined
    vi.mocked(appointmentService.update).mockImplementation(
      () =>
        new Promise<AppointmentOut>((resolve) => {
          resolveUpdate = resolve
        }),
    )
    const user = userEvent.setup()
    renderDashboard()

    const [completeButton] = await screen.findAllByRole('button', { name: 'Mark Karthik S as completed' })
    if (!completeButton) throw new Error('Complete button missing')
    await user.click(completeButton)

    expect(appointmentService.update).toHaveBeenCalledWith(7, { status: 'completed' })
    // Optimistic: the badge flips before the server answers and the booked-only actions disappear.
    expect((await screen.findAllByText('Completed', { selector: 'span' })).length).toBeGreaterThan(0)
    expect(screen.queryAllByRole('button', { name: 'Mark Karthik S as completed' })).toHaveLength(0)

    serverStatus = 'completed'
    resolveUpdate(appointment())
    await vi.waitFor(() => expect(appointmentService.listForDay).toHaveBeenCalledTimes(2))
    expect(screen.queryAllByText('Booked', { selector: 'span' })).toHaveLength(0)
  })

  it('rolls back the optimistic change when the update fails', async () => {
    vi.mocked(appointmentService.update).mockRejectedValue(new Error('Network down'))
    const user = userEvent.setup()
    renderDashboard()

    const [noShow] = await screen.findAllByRole('button', { name: 'Mark Karthik S as no-show' })
    if (!noShow) throw new Error('No-show button missing')
    await user.click(noShow)

    await vi.waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Mark Karthik S as no-show' }).length).toBeGreaterThan(0),
    )
    const table = screen.getAllByRole('table')[0]
    if (!table) throw new Error('table missing')
    expect(within(table).getByText('Booked')).toBeInTheDocument()
  })

  it('shows an empty state and the getting-started checklist without services', async () => {
    vi.mocked(appointmentService.listForDay).mockResolvedValue([])
    vi.mocked(catalogService.list).mockResolvedValue([])
    renderDashboard()
    expect(await screen.findByText('No appointments today')).toBeInTheDocument()
    expect(await screen.findByText('Get ready for your first booking')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /New booking/ })).toBeDisabled()
  })
})
