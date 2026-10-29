import {
  CalendarDays,
  ChartColumn,
  Clock,
  CreditCard,
  LayoutDashboard,
  Scissors,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  label: string
  to: string
  icon: LucideIcon
  /** Match the path exactly (used for the `/app` index route). */
  end?: boolean
}

export const APP_NAV_ITEMS: readonly NavItem[] = [
  { label: 'Today', to: '/app', icon: LayoutDashboard, end: true },
  { label: 'Calendar', to: '/app/calendar', icon: CalendarDays },
  { label: 'Customers', to: '/app/customers', icon: Users },
  { label: 'Services', to: '/app/services', icon: Scissors },
  { label: 'Working hours', to: '/app/hours', icon: Clock },
  { label: 'Reports', to: '/app/reports', icon: ChartColumn },
  { label: 'Billing', to: '/app/billing', icon: CreditCard },
  { label: 'Settings', to: '/app/settings', icon: Settings },
]

/** Title for the mobile top bar based on the current path. */
export function navTitleForPath(pathname: string): string {
  const path = pathname.replace(/\/+$/, '') || '/'
  const match = [...APP_NAV_ITEMS]
    .sort((a, b) => b.to.length - a.to.length)
    .find((item) => (item.end ? path === item.to : path === item.to || path.startsWith(`${item.to}/`)))
  return match?.label ?? 'SlotEase'
}
