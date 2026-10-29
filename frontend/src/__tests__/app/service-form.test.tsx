import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ServiceForm } from '@/components/services/ServiceFormDialog'
import { formToServicePayload, serviceSchema } from '@/components/services/service-schema'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { catalogService } from '@/services/catalogService'

vi.mock('@/services/catalogService', () => ({
  catalogService: { list: vi.fn(), create: vi.fn(), update: vi.fn(), deactivate: vi.fn() },
}))

const valid = { name: 'Haircut', description: '', duration_min: '30', price: '300' }

describe('serviceSchema', () => {
  it('accepts a valid service and builds the API payload', () => {
    const parsed = serviceSchema.parse(valid)
    expect(formToServicePayload(parsed)).toEqual({ name: 'Haircut', description: null, duration_min: 30, price: '300.00' })
  })

  it.each([
    [{ name: '  ' }, 'name', 'Enter a service name.'],
    [{ duration_min: '4' }, 'duration_min', 'between 5 and 480'],
    [{ duration_min: '481' }, 'duration_min', 'between 5 and 480'],
    [{ duration_min: '30.5' }, 'duration_min', 'whole minutes'],
    [{ price: '-1' }, 'price', 'cannot be negative'],
    [{ price: '12.345' }, 'price', 'up to 2 decimals'],
    [{ price: '' }, 'price', '0 for free'],
  ])('rejects %o', (override, field, message) => {
    const result = serviceSchema.safeParse({ ...valid, ...override })
    expect(result.success).toBe(false)
    const issue = result.error?.issues.find((i) => i.path[0] === field)
    expect(issue?.message).toContain(message)
  })

  it('accepts boundaries 5 and 480 minutes and a free price', () => {
    expect(serviceSchema.safeParse({ ...valid, duration_min: '5', price: '0' }).success).toBe(true)
    expect(serviceSchema.safeParse({ ...valid, duration_min: '480', price: '99.50' }).success).toBe(true)
  })
})

function renderForm(onDone = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <Dialog open>
        <DialogContent>
          <DialogTitle>Add a service</DialogTitle>
          <DialogDescription>Test</DialogDescription>
          <ServiceForm currencySymbol="₹" onDone={onDone} />
        </DialogContent>
      </Dialog>
    </QueryClientProvider>,
  )
  return onDone
}

describe('ServiceForm', () => {
  beforeEach(() => vi.mocked(catalogService.create).mockReset())

  it('shows inline errors and does not submit invalid input', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.clear(screen.getByLabelText('Duration (minutes)'))
    await user.type(screen.getByLabelText('Duration (minutes)'), '500')
    await user.type(screen.getByLabelText('Price (₹)'), '-5')
    await user.click(screen.getByRole('button', { name: 'Add service' }))

    expect(await screen.findByText('Enter a service name.')).toBeInTheDocument()
    expect(screen.getByText(/between 5 and 480 minutes/)).toBeInTheDocument()
    expect(screen.getByText('Price cannot be negative.')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true')
    expect(catalogService.create).not.toHaveBeenCalled()
  })

  it('submits a valid service', async () => {
    vi.mocked(catalogService.create).mockResolvedValue({
      id: 1,
      name: 'Beard trim',
      description: null,
      duration_min: 15,
      price: '150.00',
      is_active: true,
      created_at: '2026-10-01T10:00:00+05:30',
    })
    const user = userEvent.setup()
    const onDone = renderForm()
    await user.type(screen.getByLabelText('Name'), 'Beard trim')
    await user.clear(screen.getByLabelText('Duration (minutes)'))
    await user.type(screen.getByLabelText('Duration (minutes)'), '15')
    await user.type(screen.getByLabelText('Price (₹)'), '150')
    await user.click(screen.getByRole('button', { name: 'Add service' }))

    await vi.waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(vi.mocked(catalogService.create).mock.calls[0]?.[0]).toEqual({
      name: 'Beard trim',
      description: null,
      duration_min: 15,
      price: '150.00',
    })
  })
})
