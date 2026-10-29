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
import { StatusBadge } from '@/components/ui/status-badge'
import { cn } from '@/lib/utils'
import type { AppointmentStatus } from '@/types/api'

const NAV: { label: string; icon: LucideIcon; active?: boolean }[] = [
  { label: 'Today', icon: LayoutDashboard, active: true },
  { label: 'Calendar', icon: CalendarDays },
  { label: 'Customers', icon: Users },
  { label: 'Services', icon: Scissors },
  { label: 'Working hours', icon: Clock },
  { label: 'Reports', icon: ChartColumn },
  { label: 'Billing', icon: CreditCard },
  { label: 'Settings', icon: Settings },
]

const STATS = [
  { label: 'Bookings today', value: '14' },
  { label: 'Completed', value: '6' },
  { label: 'No-shows', value: '0' },
  { label: 'Revenue', value: '₹6,450' },
]

const APPOINTMENTS: { time: string; name: string; service: string; status: AppointmentStatus }[] = [
  { time: '10:00 AM', name: 'Priya Raman', service: 'Haircut + Blow-dry', status: 'completed' },
  { time: '11:15 AM', name: 'Arjun Mehta', service: 'Beard trim', status: 'completed' },
  { time: '12:30 PM', name: 'Sara Thomas', service: 'Hair colour', status: 'booked' },
  { time: '2:00 PM', name: 'Karthik S', service: 'Haircut + Beard', status: 'booked' },
  { time: '3:45 PM', name: 'Meera Iyer', service: 'Facial', status: 'booked' },
]

/** Pure HTML/CSS mock of the owner dashboard for the hero (decorative, hidden from screen readers). */
export function ProductPreview({ className }: { className?: string }) {
  return (
    <figure className={cn('w-full min-w-0', className)}>
      <figcaption className="sr-only">
        Preview of the SlotEase dashboard showing today's appointments, booking stats and revenue.
      </figcaption>
      <div
        aria-hidden="true"
        className="overflow-hidden rounded-xl border border-border bg-card shadow-sm ring-1 ring-slate-900/5 select-none"
      >
        {/* Window chrome */}
        <div className="flex items-center gap-3 border-b border-border bg-muted px-4 py-2.5">
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-slate-300" />
            <span className="size-2.5 rounded-full bg-slate-300" />
            <span className="size-2.5 rounded-full bg-slate-300" />
          </div>
          <div className="mx-auto w-full max-w-xs truncate rounded-md border border-border bg-card px-3 py-1 text-center text-xs text-muted-foreground">
            slotease.app/app
          </div>
          <div className="hidden w-[42px] sm:block" />
        </div>

        <div className="flex min-w-0">
          {/* Sidebar */}
          <div className="hidden w-48 shrink-0 border-r border-border bg-card p-3 md:block">
            <div className="mb-4 flex items-center gap-2 px-2 pt-1">
              <span className="flex size-6 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground">
                GS
              </span>
              <span className="truncate text-sm font-semibold text-foreground">Glow Salon</span>
            </div>
            <ul className="space-y-0.5">
              {NAV.map(({ label, icon: Icon, active }) => (
                <li
                  key={label}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px]',
                    active ? 'bg-primary-subtle font-medium text-primary' : 'text-muted-foreground',
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                </li>
              ))}
            </ul>
          </div>

          {/* Main */}
          <div className="min-w-0 flex-1 bg-background p-3 sm:p-5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground sm:text-xs">Saturday, 10 October</p>
                <p className="text-sm font-semibold text-foreground sm:text-base">Good morning, Asha</p>
              </div>
              <span className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground sm:text-xs">
                + New booking
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:gap-3 lg:grid-cols-4">
              {STATS.map((s) => (
                <div key={s.label} className="min-w-0 rounded-lg border border-border bg-card p-2.5 sm:p-3">
                  <p className="truncate text-[11px] text-muted-foreground sm:text-xs">{s.label}</p>
                  <p className="mt-0.5 text-base font-semibold text-foreground tabular-nums sm:text-lg">{s.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-3 rounded-lg border border-border bg-card sm:mt-4">
              <div className="flex items-center justify-between border-b border-border px-3 py-2 sm:px-4">
                <p className="text-xs font-semibold text-foreground sm:text-sm">Today's appointments</p>
                <p className="text-[11px] text-muted-foreground sm:text-xs">5 upcoming</p>
              </div>
              <ul className="divide-y divide-border">
                {APPOINTMENTS.map((a, i) => (
                  <li
                    key={a.time}
                    className={cn('flex items-center gap-3 px-3 py-2 sm:px-4 sm:py-2.5', i > 3 && 'hidden sm:flex')}
                  >
                    <span className="w-14 shrink-0 text-[11px] font-medium text-foreground tabular-nums sm:w-16 sm:text-xs">
                      {a.time}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-foreground sm:text-sm">{a.name}</span>
                      <span className="block truncate text-[11px] text-muted-foreground sm:text-xs">{a.service}</span>
                    </span>
                    <StatusBadge status={a.status} className="hidden min-[400px]:inline-flex" />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </figure>
  )
}
