import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminAuthProvider, RequireAdmin } from '@/admin/AdminAuthProvider'
import { adminService, adminToken } from '@/admin/api'
import AdminCustomerDetailPage from '@/admin/pages/AdminCustomerDetailPage'
import type { BusinessDetail } from '@/admin/types'
import { tokenStorage } from '@/lib/tokenStorage'
import ViewAsPage from '@/pages/ViewAsPage'

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: null, business: null, isLoading: false, isAuthenticated: false }),
}))

const SESSION = { token: 'view-token', business: 'Glow Salon', owner: 'asha@example.com', expiresAt: 4_102_444_800 }

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  vi.restoreAllMocks()
})

afterEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  adminToken.clear()
})

describe('view-as token storage', () => {
  it('uses the view-as token in this tab without touching the owner session', () => {
    tokenStorage.setTokens('owner-access', 'owner-refresh')
    tokenStorage.startViewAs(SESSION)

    expect(tokenStorage.getAccessToken()).toBe('view-token')
    expect(tokenStorage.getRefreshToken()).toBeNull()
    expect(tokenStorage.viewAs()).toEqual(SESSION)

    // Ending the view (or an expired view being signed out) keeps the browser's own owner login.
    tokenStorage.clear()
    expect(tokenStorage.viewAs()).toBeNull()
    expect(tokenStorage.getAccessToken()).toBe('owner-access')
    expect(tokenStorage.getRefreshToken()).toBe('owner-refresh')
    expect(window.localStorage.getItem('slotease.access_token')).toBe('owner-access')
  })

  it('a real sign-in in the tab ends the view', () => {
    tokenStorage.startViewAs(SESSION)
    tokenStorage.setTokens('a', 'r')
    expect(tokenStorage.viewAs()).toBeNull()
    expect(tokenStorage.getAccessToken()).toBe('a')
  })

  it('ignores malformed stored sessions', () => {
    window.sessionStorage.setItem('slotease.view_as', '{"token": 5}')
    expect(tokenStorage.viewAs()).toBeNull()
    window.sessionStorage.setItem('slotease.view_as', 'not json')
    expect(tokenStorage.viewAs()).toBeNull()
  })
})

describe('ViewAsPage', () => {
  it('explains an expired or missing link', () => {
    render(
      <MemoryRouter>
        <ViewAsPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'This view link has expired' })).toBeInTheDocument()
    expect(tokenStorage.viewAs()).toBeNull()
  })
})

describe('View as owner button', () => {
  it('opens the owner app read-only in a new tab via a URL-fragment hand-off', async () => {
    const user = userEvent.setup()
    const detail = {
      id: 7,
      name: 'Glow Salon',
      slug: 'glow-salon',
      phone: '+919876543210',
      email: null,
      address: null,
      timezone: 'Asia/Kolkata',
      plan: 'trial',
      subscription_status: 'trialing',
      status: 'trialing',
      is_suspended: false,
      is_bookable: true,
      trial_ends_at: null,
      current_period_end: null,
      razorpay_subscription_id: null,
      created_at: '2026-10-01T05:00:00+00:00',
      owners: [{ id: 3, email: 'asha@example.com', full_name: 'Asha K', role: 'owner', is_active: true, created_at: '2026-10-01T05:00:00+00:00', active_sessions: 0 }],
      stats: { services: 0, customers: 0, appointments_total: 0, appointments_upcoming: 0, completed: 0, no_shows: 0, cancelled: 0, last_booking_at: null, revenue_total: '0.00' },
      recent_appointments: [],
      payments: [],
      audit: [],
    } satisfies BusinessDetail
    adminToken.set('admin-token')
    vi.spyOn(adminService, 'me').mockResolvedValue({ id: 1, email: 'ops@example.com', full_name: 'Ops', last_login_at: null })
    vi.spyOn(adminService, 'business').mockResolvedValue(detail)
    const viewAs = vi
      .spyOn(adminService, 'viewAs')
      .mockResolvedValue({ access_token: 'tok.abc', expires_in: 900, business_name: 'Glow Salon', owner_email: 'asha@example.com' })
    const tab = { opener: {} as unknown, location: { href: '' }, close: vi.fn() }
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/admin/customers/7']}>
          <AdminAuthProvider>
            <Routes>
              <Route element={<RequireAdmin />}>
                <Route path="/admin/customers/:id" element={<AdminCustomerDetailPage />} />
              </Route>
            </Routes>
          </AdminAuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await user.click(await screen.findByRole('button', { name: 'View as owner' }))
    expect(open).toHaveBeenCalledWith('about:blank', '_blank')
    await waitFor(() => expect(tab.location.href).not.toBe(''))
    expect(viewAs).toHaveBeenCalledWith(7)
    expect(tab.opener).toBeNull()
    const [path, fragment] = tab.location.href.split('#')
    expect(path).toBe('/view-as')
    const params = new URLSearchParams(fragment)
    expect(params.get('token')).toBe('tok.abc')
    expect(params.get('owner')).toBe('asha@example.com')
    expect(Number(params.get('exp'))).toBeGreaterThan(Date.now() / 1000)
  })
})
