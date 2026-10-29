import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminAuthProvider, RequireAdmin } from '@/admin/AdminAuthProvider'
import { adminService, adminToken } from '@/admin/api'
import { AdminShell } from '@/admin/components/AdminShell'
import { formatChange, isoToLocalInput, localInputToIso } from '@/admin/format'
import AdminBookingsPage from '@/admin/pages/AdminBookingsPage'
import AdminCustomerDetailPage from '@/admin/pages/AdminCustomerDetailPage'
import AdminDashboardPage from '@/admin/pages/AdminDashboardPage'
import AdminLoginPage from '@/admin/pages/AdminLoginPage'
import AdminRevenuePage from '@/admin/pages/AdminRevenuePage'
import type { AdminAppointment, BusinessDetail, BusinessRow, Overview, RevenueReport } from '@/admin/types'
import { apiError } from '../public/helpers'

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), toasts) }))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: null, business: null, isLoading: false, isAuthenticated: false }),
}))

const ADMIN = { id: 1, email: 'ops@example.com', full_name: 'Ops Admin', last_login_at: null }

const ROW: BusinessRow = {
  id: 7,
  name: 'Glow Salon',
  slug: 'glow-salon',
  phone: '+919876543210',
  owner_name: 'Asha K',
  owner_email: 'asha@example.com',
  plan: 'pro',
  subscription_status: 'active',
  status: 'active',
  is_suspended: false,
  trial_ends_at: null,
  current_period_end: '2026-11-29T00:00:00+00:00',
  created_at: '2026-10-01T05:00:00+00:00',
  appointments_count: 12,
  customers_count: 9,
  last_booking_at: null,
  revenue_total: '998.00',
}

const OVERVIEW: Overview = {
  generated_at: '2026-10-29T06:00:00+00:00',
  timezone: 'Asia/Kolkata',
  plan_price: '499.00',
  businesses_total: 3,
  businesses_new_this_month: 2,
  businesses_new_last_month: 1,
  status_counts: { trialing: 1, trial_expired: 1, active: 1, past_due: 0, cancelled: 0, expired: 0, suspended: 0 },
  paying_businesses: 1,
  mrr: '499.00',
  arr: '5988.00',
  revenue_this_month: '998.00',
  revenue_last_month: '499.00',
  revenue_this_quarter: '998.00',
  revenue_this_year: '1497.00',
  revenue_lifetime: '1497.00',
  trial_conversion_rate: 50,
  bookings_today: 4,
  bookings_this_month: 40,
  bookings_total: 120,
  end_customers_total: 80,
  signups_by_month: [{ month: '2026-10', label: 'Oct 2026', signups: 2, first_payments: 1 }],
  recent_businesses: [ROW],
  recent_payments: [],
}

function revenue(granularity: RevenueReport['granularity']): RevenueReport {
  const label = { month: 'Oct 2026', quarter: 'Q4 2026', half_year: 'H2 2026', year: '2026' }[granularity]
  return {
    granularity,
    basis: 'calendar',
    timezone: 'Asia/Kolkata',
    periods: [
      { key: 'p1', label: 'Previous', start: '2026-09-01', end: '2026-09-30', revenue: '499.00', payments: 1, paying_businesses: 1, new_paying_businesses: 1, change_pct: null },
      { key: 'p2', label, start: '2026-10-01', end: '2026-10-31', revenue: '998.00', payments: 2, paying_businesses: 1, new_paying_businesses: 0, change_pct: 100 },
    ],
    total_revenue: '1497.00',
    total_payments: 3,
    average_revenue: '748.50',
  }
}

function renderAdmin(path: string, signedIn = true) {
  if (signedIn) adminToken.set('admin-token')
  vi.spyOn(adminService, 'me').mockResolvedValue(ADMIN)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AdminAuthProvider>
          <Routes>
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route element={<RequireAdmin />}>
              <Route element={<AdminShell />}>
                <Route path="/admin" element={<AdminDashboardPage />} />
                <Route path="/admin/revenue" element={<AdminRevenuePage />} />
                <Route path="/admin/customers/:id" element={<AdminCustomerDetailPage />} />
                <Route path="/admin/bookings" element={<AdminBookingsPage />} />
              </Route>
            </Route>
          </Routes>
        </AdminAuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
  adminToken.clear()
})

afterEach(() => adminToken.clear())

describe('admin format helpers', () => {
  it('formats changes and converts IST inputs', () => {
    expect(formatChange(null)).toBe('—')
    expect(formatChange(12.345)).toBe('+12.3%')
    expect(formatChange(-3)).toBe('-3%')
    expect(localInputToIso('2026-12-31T23:59')).toBe('2026-12-31T23:59:00+05:30')
    expect(isoToLocalInput('2026-12-31T18:29:00+00:00')).toBe('2026-12-31T23:59')
    expect(isoToLocalInput(null)).toBe('')
  })
})

describe('admin sign-in', () => {
  it('redirects to sign-in without a session', async () => {
    renderAdmin('/admin', false)
    expect(await screen.findByRole('heading', { name: 'SlotEase admin' })).toBeInTheDocument()
  })

  it('enrols two-step sign-in on first login, then opens the dashboard', async () => {
    const user = userEvent.setup()
    vi.spyOn(adminService, 'login').mockResolvedValue({
      step: 'setup',
      challenge_token: 'challenge',
      secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
      otpauth_uri: 'otpauth://totp/SlotEase%20Admin:ops@example.com?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
    })
    const verify = vi
      .spyOn(adminService, 'verify')
      .mockRejectedValueOnce(apiError(401, { error: 'INVALID_CODE', message: 'bad' }))
      .mockResolvedValueOnce({ access_token: 'tok', token_type: 'bearer', expires_in: 7200, admin: ADMIN })
    vi.spyOn(adminService, 'overview').mockResolvedValue(OVERVIEW)
    renderAdmin('/admin/login', false)

    await user.type(await screen.findByLabelText('Email'), 'ops@example.com')
    await user.type(screen.getByLabelText('Password'), 'Admin-Passw0rd')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByText('Set up two-step sign-in')).toBeInTheDocument()
    expect(screen.getByText('JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Authenticator code'), '12345')
    await user.click(screen.getByRole('button', { name: 'Turn on and sign in' }))
    expect(await screen.findByText('Enter the 6-digit code.')).toBeInTheDocument()
    expect(verify).not.toHaveBeenCalled()

    await user.clear(screen.getByLabelText('Authenticator code'))
    await user.type(screen.getByLabelText('Authenticator code'), '123 456')
    await user.click(screen.getByRole('button', { name: 'Turn on and sign in' }))
    expect(await screen.findByText('That code is not valid. Try the newest code.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Turn on and sign in' }))

    await waitFor(() => expect(verify).toHaveBeenLastCalledWith('challenge', '123456'))
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(adminToken.get()).toBe('tok')
  })

  it('shows a wrong password', async () => {
    const user = userEvent.setup()
    vi.spyOn(adminService, 'login').mockRejectedValue(apiError(401, { error: 'INVALID_CREDENTIALS', message: 'x' }))
    renderAdmin('/admin/login', false)
    await user.type(await screen.findByLabelText('Email'), 'ops@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('Email or password is incorrect.')).toBeInTheDocument()
  })
})

describe('admin pages', () => {
  it('dashboard shows the summary numbers and newest customers', async () => {
    vi.spyOn(adminService, 'overview').mockResolvedValue(OVERVIEW)
    renderAdmin('/admin')
    expect(await screen.findByText('₹499')).toBeInTheDocument()
    expect(screen.getByText('1 paying × ₹499 · ARR ₹5,988')).toBeInTheDocument()
    expect(screen.getByText('+100% vs last month')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Glow Salon' }).length).toBeGreaterThan(0)
    expect(screen.getByRole('navigation', { name: 'Admin' })).toBeInTheDocument()
  })

  it('revenue switches between monthly, quarterly, half-yearly and yearly', async () => {
    const user = userEvent.setup()
    const spy = vi.spyOn(adminService, 'revenue').mockImplementation(async (g) => revenue(g))
    renderAdmin('/admin/revenue')
    expect(await screen.findByRole('cell', { name: 'Oct 2026' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '+100%' })).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Quarterly' }))
    expect(await screen.findByRole('cell', { name: 'Q4 2026' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Half-yearly' }))
    expect(await screen.findByRole('cell', { name: 'H2 2026' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Yearly' }))
    expect(await screen.findByRole('cell', { name: '2026' })).toBeInTheDocument()
    expect(spy.mock.calls.map((c) => c[0])).toEqual(['month', 'quarter', 'half_year', 'year'])
  })

  it('customer detail suspends the booking page', async () => {
    const user = userEvent.setup()
    const detail: BusinessDetail = {
      ...ROW,
      email: null,
      address: null,
      timezone: 'Asia/Kolkata',
      is_bookable: true,
      razorpay_subscription_id: 'sub_1',
      owners: [{ id: 3, email: 'asha@example.com', full_name: 'Asha K', role: 'owner', is_active: true, created_at: ROW.created_at, active_sessions: 1 }],
      stats: { services: 2, customers: 9, appointments_total: 12, appointments_upcoming: 3, completed: 8, no_shows: 1, cancelled: 0, last_booking_at: null, revenue_total: '998.00' },
      recent_appointments: [],
      payments: [],
      audit: [],
    }
    vi.spyOn(adminService, 'business').mockResolvedValue(detail)
    const update = vi.spyOn(adminService, 'updateBusiness').mockResolvedValue({ ...detail, is_suspended: true, status: 'suspended' })
    renderAdmin('/admin/customers/7')

    expect(await screen.findByRole('heading', { name: /Glow Salon/ })).toBeInTheDocument()
    expect(screen.getByText('Taking bookings')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Suspend' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Suspend booking page' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith(7, { is_suspended: true }))
  })

  it('bookings search changes a status and explains a taken slot', async () => {
    const user = userEvent.setup()
    const appt: AdminAppointment = {
      id: 5,
      reference: 'APT-20261010-0005',
      business_id: 7,
      business_name: 'Glow Salon',
      business_slug: 'glow-salon',
      business_timezone: 'Asia/Kolkata',
      service_name: 'Haircut',
      customer_name: 'Karthik S',
      customer_phone: '+919800000001',
      customer_email: null,
      start_time: '2026-10-10T17:30:00+05:30',
      end_time: '2026-10-10T18:00:00+05:30',
      status: 'cancelled',
      price: '300.00',
      source: 'online',
      notes: null,
      created_at: '2026-10-01T05:00:00+00:00',
    }
    const search = vi.spyOn(adminService, 'appointments').mockResolvedValue([appt])
    vi.spyOn(adminService, 'updateAppointment').mockRejectedValue(apiError(409, { error: 'SLOT_TAKEN', message: 'x' }))
    renderAdmin('/admin/bookings')

    expect(await screen.findByText('APT-20261010-0005')).toBeInTheDocument()
    expect(screen.getByText(/Sat 10 Oct, 5:30 PM/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Search bookings'), 'APT-2026')
    await waitFor(() => expect(search).toHaveBeenLastCalledWith({ q: 'APT-2026', status: undefined, business_id: undefined }))

    await user.click(screen.getByRole('combobox', { name: /Status of booking/ }))
    await user.click(await screen.findByRole('option', { name: 'Booked' }))
    await waitFor(() =>
      expect(toasts.error).toHaveBeenCalledWith('That time is now taken by another booking, so it cannot be re-booked.'),
    )
  })
})
