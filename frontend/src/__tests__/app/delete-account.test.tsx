import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DeleteAccountCard } from '@/components/settings/DeleteAccountCard'
import { businessService } from '@/services/businessService'
import type { BusinessOut } from '@/types/api'
import { apiError } from '../public/helpers'

const auth = vi.hoisted(() => ({ logout: vi.fn() }))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ logout: auth.logout }),
}))

const business = {
  id: 1,
  name: 'Glow Salon',
  slug: 'glow-salon',
  subscription_status: 'active',
} as BusinessOut

function renderCard() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/app/settings']}>
        <Routes>
          <Route path="/app/settings" element={<DeleteAccountCard business={business} />} />
          <Route path="/" element={<p>Home page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Delete account' }))
  return screen.findByRole('alertdialog')
}

beforeEach(() => {
  vi.restoreAllMocks()
  auth.logout.mockReset().mockResolvedValue(undefined)
})

describe('DeleteAccountCard', () => {
  it('only enables deletion once the slug is typed, then deletes, signs out and goes home', async () => {
    const user = userEvent.setup()
    const remove = vi.spyOn(businessService, 'remove').mockResolvedValue(undefined)
    renderCard()
    await openDialog(user)

    expect(screen.getByText(/subscription will be cancelled immediately/)).toBeInTheDocument()
    const submit = screen.getByRole('button', { name: 'Delete permanently' })
    expect(submit).toBeDisabled()

    await user.type(screen.getByLabelText('Your password'), 'Passw0rd123')
    await user.type(screen.getByLabelText(/to confirm/), 'glow-sal')
    expect(submit).toBeDisabled()
    await user.type(screen.getByLabelText(/to confirm/), 'on')
    expect(submit).toBeEnabled()

    await user.click(submit)
    await waitFor(() => expect(remove).toHaveBeenCalledWith({ password: 'Passw0rd123', confirm: 'glow-salon' }))
    await waitFor(() => expect(auth.logout).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Home page')).toBeInTheDocument()
  })

  it('shows a wrong password on the password field and keeps the session', async () => {
    const user = userEvent.setup()
    vi.spyOn(businessService, 'remove').mockRejectedValue(apiError(400, { error: 'INVALID_PASSWORD', message: 'Password is incorrect.' }))
    renderCard()
    await openDialog(user)

    await user.type(screen.getByLabelText('Your password'), 'wrong')
    await user.type(screen.getByLabelText(/to confirm/), 'glow-salon')
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }))

    expect(await screen.findByText('Password is incorrect.')).toBeInTheDocument()
    expect(screen.getByLabelText('Your password')).toHaveAttribute('aria-invalid', 'true')
    expect(auth.logout).not.toHaveBeenCalled()
  })

  it('explains that nothing was deleted when Razorpay cannot cancel the subscription', async () => {
    const user = userEvent.setup()
    vi.spyOn(businessService, 'remove').mockRejectedValue(apiError(503, { error: 'PAYMENT_PROVIDER_ERROR', message: 'Unavailable.' }))
    renderCard()
    await openDialog(user)

    await user.type(screen.getByLabelText('Your password'), 'Passw0rd123')
    await user.type(screen.getByLabelText(/to confirm/), 'glow-salon')
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }))

    expect(await screen.findByText(/so nothing was deleted/)).toBeInTheDocument()
    expect(auth.logout).not.toHaveBeenCalled()
  })
})
