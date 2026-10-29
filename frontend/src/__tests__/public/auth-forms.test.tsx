import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RegisterForm } from '@/components/auth/RegisterForm'
import { slugify } from '@/lib/validation'
import LoginPage from '@/pages/LoginPage'
import { apiError } from './helpers'

const auth = vi.hoisted(() => ({
  login: vi.fn(),
  register: vi.fn(),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    business: null,
    isLoading: false,
    isAuthenticated: false,
    login: auth.login,
    register: auth.register,
    logout: vi.fn(),
    refreshMe: vi.fn(),
    setBusiness: vi.fn(),
    setUser: vi.fn(),
  }),
}))

beforeEach(() => {
  auth.login.mockReset()
  auth.register.mockReset()
})

describe('slugify', () => {
  it('mirrors the backend rules', () => {
    expect(slugify('Glow Salon & Spa!')).toBe('glow-salon-spa')
    expect(slugify('  Café  Crème  ')).toBe('cafe-creme')
    expect(slugify('A')).toBe('a-1')
    expect(slugify('')).toBe('')
    expect(slugify('x'.repeat(60))).toHaveLength(40)
  })
})

describe('RegisterForm', () => {
  function renderForm(onSuccess = vi.fn()) {
    render(
      <MemoryRouter>
        <RegisterForm onSuccess={onSuccess} />
      </MemoryRouter>,
    )
    return onSuccess
  }

  it('derives the slug from the business name until the slug is edited', async () => {
    const user = userEvent.setup()
    renderForm()
    const name = screen.getByLabelText('Business name')
    const slug = screen.getByLabelText('Booking page address')

    await user.type(name, 'Glow Salon & Spa')
    expect(slug).toHaveValue('glow-salon-spa')
    expect(screen.getByTestId('slug-preview')).toHaveTextContent(`${window.location.host}/glow-salon-spa`)

    await user.clear(slug)
    await user.type(slug, 'glow-chennai')
    await user.type(name, ' Chennai')
    expect(slug).toHaveValue('glow-chennai')
    expect(screen.getByTestId('slug-preview')).toHaveTextContent('/glow-chennai')
  })

  it('validates fields with the backend rules before submitting', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole('button', { name: 'Start 14-day free trial' }))
    expect(await screen.findByText('Business name must be at least 2 characters.')).toBeInTheDocument()
    expect(screen.getByText('Enter your full name.')).toBeInTheDocument()
    expect(screen.getByText('Enter your email address.')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Business name'), 'Glow Salon')
    await user.type(screen.getByLabelText('Full name'), 'Asha Kumar')
    await user.type(screen.getByLabelText('Work email'), 'asha@glow.in')
    await user.type(screen.getByLabelText('Phone'), '12345')
    await user.type(screen.getByLabelText('Password'), 'passwordonly')
    await user.click(screen.getByRole('button', { name: 'Start 14-day free trial' }))

    expect(await screen.findByText('Phone number must have 7–15 digits.')).toBeInTheDocument()
    expect(screen.getByText('Include at least one number.')).toBeInTheDocument()
    expect(auth.register).not.toHaveBeenCalled()

    const slug = screen.getByLabelText('Booking page address')
    await user.clear(slug)
    await user.type(slug, 'login')
    await user.click(screen.getByRole('button', { name: 'Start 14-day free trial' }))
    expect(await screen.findByText('This address is reserved. Please choose another.')).toBeInTheDocument()
  })

  it('submits valid data and maps EMAIL_TAKEN onto the email field', async () => {
    const user = userEvent.setup()
    auth.register.mockRejectedValueOnce(
      apiError(409, { error: 'EMAIL_TAKEN', message: 'An account with this email already exists.' }),
    )
    const onSuccess = renderForm()

    await user.type(screen.getByLabelText('Business name'), 'Glow Salon')
    await user.type(screen.getByLabelText('Full name'), 'Asha Kumar')
    await user.type(screen.getByLabelText('Work email'), 'Asha@Glow.in')
    await user.type(screen.getByLabelText('Phone'), '+91 98765 43210')
    await user.type(screen.getByLabelText('Password'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Start 14-day free trial' }))

    await waitFor(() => expect(auth.register).toHaveBeenCalledTimes(1))
    expect(auth.register).toHaveBeenCalledWith(
      expect.objectContaining({
        business_name: 'Glow Salon',
        slug: 'glow-salon',
        email: 'asha@glow.in',
        phone: '+91 98765 43210',
        password: 'secret123',
        timezone: expect.any(String),
      }),
    )
    expect(await screen.findByText('An account with this email already exists.')).toBeInTheDocument()
    expect(screen.getByLabelText('Work email')).toHaveAttribute('aria-invalid', 'true')
    expect(onSuccess).not.toHaveBeenCalled()
  })
})

describe('LoginPage', () => {
  function renderLogin(path = '/login') {
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/app" element={<p>Dashboard</p>} />
          <Route path="/app/calendar" element={<p>Calendar page</p>} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('shows the server message for invalid credentials', async () => {
    const user = userEvent.setup()
    auth.login.mockRejectedValueOnce(
      apiError(401, { error: 'INVALID_CREDENTIALS', message: 'Incorrect email or password.' }),
    )
    renderLogin()

    await user.type(screen.getByLabelText('Email'), 'owner@glow.in')
    await user.type(screen.getByLabelText('Password'), 'wrongpass1')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.')
    expect(auth.login).toHaveBeenCalledWith({ email: 'owner@glow.in', password: 'wrongpass1' })
  })

  it('validates required fields', async () => {
    const user = userEvent.setup()
    renderLogin()
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Enter your email address.')).toBeInTheDocument()
    expect(screen.getByText('Enter your password.')).toBeInTheDocument()
    expect(auth.login).not.toHaveBeenCalled()
  })

  it('redirects to a safe ?next= path after signing in', async () => {
    const user = userEvent.setup()
    auth.login.mockResolvedValueOnce(undefined)
    renderLogin('/login?next=%2Fapp%2Fcalendar')

    await user.type(screen.getByLabelText('Email'), 'owner@glow.in')
    await user.type(screen.getByLabelText('Password'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Calendar page')).toBeInTheDocument()
  })

  it('ignores an unsafe ?next= and goes to /app', async () => {
    const user = userEvent.setup()
    auth.login.mockResolvedValueOnce(undefined)
    renderLogin('/login?next=%2F%2Fevil.com')

    await user.type(screen.getByLabelText('Email'), 'owner@glow.in')
    await user.type(screen.getByLabelText('Password'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Dashboard')).toBeInTheDocument()
  })
})
