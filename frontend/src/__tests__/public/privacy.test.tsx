import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { PublicFooter } from '@/components/layout/PublicLayout'
import { PRIVACY_CONTACT_EMAIL, PRIVACY_LAST_UPDATED } from '@/lib/legal'
import PrivacyPage from '@/pages/PrivacyPage'

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: null, business: null, isLoading: false, isAuthenticated: false }),
}))

describe('PrivacyPage', () => {
  it('renders the policy with a linked table of contents and a contact address', () => {
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeInTheDocument()
    expect(screen.getByText(`Last updated ${PRIVACY_LAST_UPDATED}`)).toBeInTheDocument()
    expect(document.title).toContain('Privacy policy')

    const contents = screen.getByRole('navigation', { name: 'Contents' })
    const links = within(contents).getAllByRole('link')
    expect(links.length).toBeGreaterThanOrEqual(8)
    for (const link of links) {
      const id = link.getAttribute('href')?.slice(1) ?? ''
      expect(document.getElementById(id), `section #${id}`).not.toBeNull()
    }

    expect(screen.getByRole('link', { name: PRIVACY_CONTACT_EMAIL })).toHaveAttribute(
      'href',
      `mailto:${PRIVACY_CONTACT_EMAIL}`,
    )
  })
})

describe('PublicFooter', () => {
  it('links to the privacy policy', () => {
    render(
      <MemoryRouter>
        <PublicFooter />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute('href', '/privacy')
  })
})
