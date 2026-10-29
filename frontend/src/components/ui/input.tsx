import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/** Shared field styling: 44px / 16px text on mobile (no iOS zoom), 40px / 14px from `sm`. */
export const fieldClasses =
  'flex w-full min-w-0 rounded-md border border-input bg-card px-3 text-base text-foreground shadow-sm transition-colors duration-150 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring/30 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:outline-destructive/30 sm:text-sm'

export type InputProps = ComponentProps<'input'>

export function Input({ className, type = 'text', ...props }: InputProps) {
  return (
    <input
      type={type}
      className={cn(
        fieldClasses,
        'h-11 py-2 sm:h-10',
        'file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium',
        className,
      )}
      {...props}
    />
  )
}
