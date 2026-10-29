import { cva, type VariantProps } from 'class-variance-authority'
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

const alertVariants = cva('relative flex w-full gap-3 rounded-lg border px-4 py-3 text-sm', {
  variants: {
    variant: {
      info: 'border-blue-200 bg-blue-50 text-blue-900 [&_[data-slot=alert-icon]]:text-blue-700',
      success: 'border-green-200 bg-green-50 text-green-900 [&_[data-slot=alert-icon]]:text-green-700',
      warning: 'border-amber-200 bg-amber-50 text-amber-900 [&_[data-slot=alert-icon]]:text-amber-700',
      destructive: 'border-red-200 bg-red-50 text-red-900 [&_[data-slot=alert-icon]]:text-red-700',
      neutral: 'border-border bg-card text-foreground [&_[data-slot=alert-icon]]:text-muted-foreground',
    },
  },
  defaultVariants: { variant: 'info' },
})

const DEFAULT_ICONS: Record<NonNullable<VariantProps<typeof alertVariants>['variant']>, LucideIcon> = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  destructive: CircleAlert,
  neutral: Info,
}

export interface AlertProps extends ComponentProps<'div'>, VariantProps<typeof alertVariants> {
  /** Override the icon, or pass `null` to hide it. */
  icon?: LucideIcon | null
}

/** Inline status message. `destructive` and `warning` are announced as alerts; others as status. */
export function Alert({ className, variant, icon, children, role, ...props }: AlertProps) {
  const resolvedVariant = variant ?? 'info'
  const Icon = icon === null ? null : (icon ?? DEFAULT_ICONS[resolvedVariant])
  const defaultRole = resolvedVariant === 'destructive' || resolvedVariant === 'warning' ? 'alert' : 'status'
  return (
    <div role={role ?? defaultRole} className={cn(alertVariants({ variant }), className)} {...props}>
      {Icon && <Icon data-slot="alert-icon" className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
      <div className="min-w-0 flex-1 space-y-1">{children}</div>
    </div>
  )
}

export function AlertTitle({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('leading-tight font-semibold', className)} {...props} />
}

export function AlertDescription({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('leading-relaxed opacity-90 [&_p]:leading-relaxed', className)} {...props} />
}
