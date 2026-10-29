import { ChevronsUpDown, ExternalLink, LogOut, Menu, Settings, CreditCard } from 'lucide-react'
import { Suspense, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { APP_NAV_ITEMS, navTitleForPath } from '@/components/layout/nav-items'
import { Logo } from '@/components/layout/Logo'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { PageSpinner } from '@/components/ui/spinner'
import { useAuth } from '@/hooks/useAuth'
import { daysUntil } from '@/lib/datetime'
import { cn, getInitials, pluralize } from '@/lib/utils'
import type { BusinessOut, UserOut } from '@/types/api'

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5 px-3">
      {APP_NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors duration-150 lg:min-h-9',
              isActive
                ? 'bg-primary-subtle text-primary'
                : 'text-slate-600 hover:bg-muted hover:text-foreground',
            )
          }
        >
          {({ isActive }) => (
            <>
              <item.icon
                className={cn('size-[18px] shrink-0', isActive ? 'text-primary' : 'text-slate-400')}
                aria-hidden="true"
              />
              {item.label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

function BookingPageLink({ slug, onNavigate }: { slug: string; onNavigate?: () => void }) {
  return (
    <a
      href={`/${slug}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onNavigate}
      className="flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-primary transition-colors hover:bg-primary-subtle lg:min-h-9"
    >
      <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
      View booking page
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  )
}

/* ------------------------------------------------------------------ */
/* User menu                                                           */
/* ------------------------------------------------------------------ */

function UserMenuItems({ user, onSignOut }: { user: UserOut; onSignOut: () => void }) {
  const navigate = useNavigate()
  return (
    <>
      <DropdownMenuLabel className="font-normal">
        <p className="truncate text-sm font-medium text-foreground">{user.full_name}</p>
        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => navigate('/app/settings')}>
        <Settings aria-hidden="true" />
        Settings
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => navigate('/app/billing')}>
        <CreditCard aria-hidden="true" />
        Billing
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={onSignOut}>
        <LogOut aria-hidden="true" />
        Sign out
      </DropdownMenuItem>
    </>
  )
}

function SidebarUserMenu({ user, business, onSignOut }: { user: UserOut; business: BusinessOut; onSignOut: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
          aria-label="Account menu"
        >
          <Avatar className="size-8">
            <AvatarFallback>{getInitials(user.full_name)}</AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">{user.full_name}</span>
            <span className="block truncate text-xs text-muted-foreground">{business.name}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
        <UserMenuItems user={user} onSignOut={onSignOut} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/* ------------------------------------------------------------------ */
/* Banners                                                             */
/* ------------------------------------------------------------------ */

function SubscriptionBanner({ business }: { business: BusinessOut }) {
  if (!business.is_bookable) {
    return (
      <div role="alert" className="border-b border-red-200 bg-red-50 px-safe">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-1 px-4 py-2.5 text-sm text-red-900 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6 lg:px-8">
          <p>
            <span className="font-semibold">Online booking is paused.</span>{' '}
            Your plan is inactive, so customers can&apos;t book from your page.
          </p>
          <Link
            to="/app/billing"
            className="inline-flex min-h-11 shrink-0 items-center font-semibold text-red-900 underline underline-offset-4 hover:no-underline sm:min-h-0"
          >
            Subscribe to reactivate
          </Link>
        </div>
      </div>
    )
  }

  if (business.subscription_status === 'trialing') {
    const days = daysUntil(business.trial_ends_at)
    return (
      <div role="status" className="border-b border-blue-200 bg-blue-50 px-safe">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-4 py-2 text-sm text-blue-900 sm:px-6 lg:px-8">
          <p className="min-w-0">
            {days > 0 ? <>Trial ends in {pluralize(days, 'day')}</> : <>Your trial ends today</>}
            <span className="hidden sm:inline"> · Upgrade to keep taking online bookings.</span>
          </p>
          <Link
            to="/app/billing"
            className="inline-flex min-h-11 shrink-0 items-center font-semibold text-primary underline-offset-4 hover:underline sm:min-h-0"
          >
            Upgrade
          </Link>
        </div>
      </div>
    )
  }

  return null
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

/** Owner app layout: fixed sidebar at `lg+`, top bar + slide-in drawer below `lg`. */
export function AppShell() {
  const { user, business, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [drawerOpen, setDrawerOpen] = useState(false)

  if (!user || !business) return <PageSpinner />

  const closeDrawer = () => setDrawerOpen(false)
  const handleSignOut = () => {
    void logout().then(() => navigate('/login', { replace: true }))
  }

  return (
    <div className="min-h-dvh bg-background">
      <a
        href="#main-content"
        className="sr-only z-[60] rounded-md bg-card px-4 py-2 text-sm font-medium shadow focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-card pl-safe lg:flex">
        <div className="flex h-16 shrink-0 items-center px-6">
          <Logo to="/app" />
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          <SidebarNav />
        </div>
        <div className="shrink-0 space-y-2 border-t border-border p-3 pb-safe-4">
          <BookingPageLink slug={business.slug} />
          <SidebarUserMenu user={user} business={business} onSignOut={handleSignOut} />
        </div>
      </aside>

      {/* Mobile / tablet top bar */}
      <header className="sticky top-0 z-30 border-b border-border bg-card pt-safe px-safe lg:hidden">
        <div className="flex h-14 items-center gap-2 px-2 sm:px-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
          >
            <Menu className="size-5" aria-hidden="true" />
          </Button>
          <p className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">
            {navTitleForPath(location.pathname)}
          </p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Account menu" className="rounded-full">
                <Avatar className="size-8">
                  <AvatarFallback>{getInitials(user.full_name)}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-60">
              <UserMenuItems user={user} onSignOut={handleSignOut} />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Mobile drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="lg:hidden">
          <div className="flex h-14 shrink-0 items-center border-b border-border px-4">
            <Logo to="/app" />
          </div>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Move between sections of your SlotEase workspace.</SheetDescription>
          <div className="flex-1 overflow-y-auto py-3">
            <SidebarNav onNavigate={closeDrawer} />
          </div>
          <div className="shrink-0 space-y-1 border-t border-border p-3">
            <p className="truncate px-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {business.name}
            </p>
            <BookingPageLink slug={business.slug} onNavigate={closeDrawer} />
            <button
              type="button"
              onClick={() => {
                closeDrawer()
                handleSignOut()
              }}
              className="flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-muted hover:text-foreground"
            >
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-h-dvh flex-col lg:min-h-dvh lg:pl-64">
        <SubscriptionBanner business={business} />
        <main id="main-content" tabIndex={-1} className="flex-1 px-safe pb-safe focus:outline-none">
          <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
            <Suspense fallback={<PageSpinner />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  )
}
