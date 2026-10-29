import {
  BarChart3,
  Building2,
  CalendarSearch,
  CreditCard,
  IndianRupee,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { Suspense, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAdminAuth } from '@/admin/admin-auth-context'
import { Logo } from '@/components/layout/Logo'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { PageSpinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

interface AdminNavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

const ADMIN_NAV: AdminNavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/revenue', label: 'Revenue', icon: BarChart3 },
  { to: '/admin/customers', label: 'Customers', icon: Building2 },
  { to: '/admin/subscriptions', label: 'Subscriptions', icon: CreditCard },
  { to: '/admin/payments', label: 'Payments', icon: IndianRupee },
  { to: '/admin/bookings', label: 'Bookings', icon: CalendarSearch },
  { to: '/admin/audit', label: 'Audit log', icon: ScrollText },
]

function titleFor(pathname: string): string {
  const match = [...ADMIN_NAV].sort((a, b) => b.to.length - a.to.length).find((i) => pathname.startsWith(i.to))
  return match?.label ?? 'Admin'
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Admin" className="flex flex-col gap-0.5 px-3">
      {ADMIN_NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors duration-150 lg:min-h-9',
              isActive ? 'bg-primary-subtle text-primary' : 'text-slate-600 hover:bg-muted hover:text-foreground',
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

function AdminBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-slate-700 uppercase">
      <ShieldCheck className="size-3" aria-hidden="true" />
      Admin
    </span>
  )
}

/** Platform admin layout: same structure as the owner app, with its own navigation. */
export function AdminShell() {
  const { admin, signOut } = useAdminAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  if (!admin) return <PageSpinner />

  const handleSignOut = () => {
    signOut()
    navigate('/admin/login', { replace: true })
  }

  const account = (
    <div className="space-y-1">
      <div className="px-3 pb-1">
        <p className="truncate text-sm font-medium text-foreground">{admin.full_name}</p>
        <p className="truncate text-xs text-muted-foreground">{admin.email}</p>
      </div>
      <button
        type="button"
        onClick={handleSignOut}
        className="flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-muted hover:text-foreground lg:min-h-9"
      >
        <LogOut className="size-4" aria-hidden="true" />
        Sign out
      </button>
    </div>
  )

  return (
    <div className="min-h-dvh bg-background">
      <a
        href="#main-content"
        className="sr-only z-[60] rounded-md bg-card px-4 py-2 text-sm font-medium shadow focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-card pl-safe lg:flex">
        <div className="flex h-16 shrink-0 items-center gap-2 px-6">
          <Logo to="/admin" />
          <AdminBadge />
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          <Nav />
        </div>
        <div className="shrink-0 border-t border-border p-3 pb-safe-4">{account}</div>
      </aside>

      <header className="sticky top-0 z-30 border-b border-border bg-card pt-safe px-safe lg:hidden">
        <div className="flex h-14 items-center gap-2 px-2 sm:px-4">
          <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Open navigation" aria-expanded={open}>
            <Menu className="size-5" aria-hidden="true" />
          </Button>
          <p className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">{titleFor(location.pathname)}</p>
          <AdminBadge />
        </div>
      </header>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="lg:hidden">
          <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
            <Logo to="/admin" />
            <AdminBadge />
          </div>
          <SheetTitle className="sr-only">Admin navigation</SheetTitle>
          <SheetDescription className="sr-only">Move between sections of the SlotEase admin.</SheetDescription>
          <div className="flex-1 overflow-y-auto py-3">
            <Nav onNavigate={() => setOpen(false)} />
          </div>
          <div className="shrink-0 border-t border-border p-3">{account}</div>
        </SheetContent>
      </Sheet>

      <div className="flex min-h-dvh flex-col lg:pl-64">
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
