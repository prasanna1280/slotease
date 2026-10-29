import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export type StatTone = 'default' | 'primary' | 'success' | 'warning' | 'destructive'

const TONE_ICON: Record<StatTone, string> = {
  default: 'bg-muted text-slate-600',
  primary: 'bg-blue-50 text-blue-700',
  success: 'bg-green-50 text-green-700',
  warning: 'bg-amber-50 text-amber-700',
  destructive: 'bg-red-50 text-red-700',
}

export interface StatCardProps {
  label: string
  value: ReactNode
  /** Secondary line under the value, e.g. "vs 12 last week". */
  hint?: ReactNode
  icon?: LucideIcon
  tone?: StatTone
  loading?: boolean
  className?: string
}

/** KPI tile: label, large tabular value, optional icon and hint. */
export function StatCard({ label, value, hint, icon: Icon, tone = 'default', loading = false, className }: StatCardProps) {
  return (
    <div className={cn('rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-md', TONE_ICON[tone])}>
            <Icon className="size-4" aria-hidden="true" />
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-24" />
      ) : (
        <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground tabular-nums">{value}</p>
      )}
      {hint && !loading && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
