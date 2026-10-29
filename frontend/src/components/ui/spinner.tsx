import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const SIZES = { sm: 'size-4', md: 'size-6', lg: 'size-8' } as const

export interface SpinnerProps {
  size?: keyof typeof SIZES
  /** Accessible label announced to screen readers. */
  label?: string
  className?: string
}

export function Spinner({ size = 'md', label = 'Loading', className }: SpinnerProps) {
  return (
    <span role="status" aria-live="polite" className={cn('inline-flex items-center justify-center', className)}>
      <Loader2 className={cn('animate-spin text-primary', SIZES[size])} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  )
}

/** Centred spinner filling the available height (route-level loading). */
export function PageSpinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-[50dvh] flex-1 items-center justify-center">
      <Spinner size="lg" label={label} />
    </div>
  )
}
