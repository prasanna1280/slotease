import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/layout/Logo'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

export interface PublicLayoutProps {
  children: ReactNode
  /** Extra links rendered in the header before the auth buttons (e.g. landing anchors, desktop only). */
  navLinks?: ReactNode
  /** Hide the Sign in / Start free trial buttons (e.g. on the auth pages themselves). */
  hideAuthActions?: boolean
  /** Hide the footer (e.g. on a focused booking flow). */
  hideFooter?: boolean
  /** Classes for the <main> element. */
  className?: string
}

export function PublicHeader({ navLinks, hideAuthActions = false }: Pick<PublicLayoutProps, 'navLinks' | 'hideAuthActions'>) {
  const { isAuthenticated } = useAuth()
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card pt-safe px-safe">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Logo to="/" />
        <div className="flex items-center gap-1 sm:gap-2">
          {navLinks && <nav aria-label="Primary" className="mr-2 hidden items-center gap-1 md:flex">{navLinks}</nav>}
          {!hideAuthActions &&
            (isAuthenticated ? (
              <Button asChild size="sm">
                <Link to="/app">Go to dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/register">
                    <span className="sm:hidden">Start trial</span>
                    <span className="hidden sm:inline">Start free trial</span>
                  </Link>
                </Button>
              </>
            ))}
        </div>
      </div>
    </header>
  )
}

export function PublicFooter() {
  const year = new Date().getFullYear()
  return (
    <footer className="border-t border-border bg-card px-safe pb-safe">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Logo size="sm" />
          <span className="hidden sm:inline">Online appointment booking for clinics and salons.</span>
        </div>
        <p>© {year} SlotEase. All rights reserved.</p>
      </div>
    </footer>
  )
}

/** Layout for marketing, auth and other public pages: header with logo + auth actions, content, footer. */
export function PublicLayout({ children, navLinks, hideAuthActions, hideFooter = false, className }: PublicLayoutProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <PublicHeader navLinks={navLinks} hideAuthActions={hideAuthActions} />
      <main id="main-content" className={cn('flex flex-1 flex-col px-safe', className)}>
        {children}
      </main>
      {!hideFooter && <PublicFooter />}
    </div>
  )
}
