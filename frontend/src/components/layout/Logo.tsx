import { CalendarCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

const SIZES = {
  sm: { box: 'size-7', icon: 'size-4', text: 'text-base' },
  md: { box: 'size-8', icon: 'size-[18px]', text: 'text-lg' },
  lg: { box: 'size-10', icon: 'size-5', text: 'text-xl' },
} as const

export interface LogoProps {
  size?: keyof typeof SIZES
  /** Hide the "SlotEase" wordmark (icon only). */
  iconOnly?: boolean
  /** Wrap in a router link to this path. */
  to?: string
  className?: string
}

/** Brand mark: solid primary rounded square with a calendar-check icon + "SlotEase" wordmark. */
export function Logo({ size = 'md', iconOnly = false, to, className }: LogoProps) {
  const s = SIZES[size]
  const content = (
    <>
      <span
        className={cn('flex shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground', s.box)}
        aria-hidden="true"
      >
        <CalendarCheck className={s.icon} strokeWidth={2.25} />
      </span>
      {iconOnly ? (
        <span className="sr-only">SlotEase</span>
      ) : (
        <span className={cn('font-semibold tracking-tight text-foreground', s.text)}>SlotEase</span>
      )}
    </>
  )

  const classes = cn('inline-flex items-center gap-2', className)

  if (to) {
    return (
      <Link
        to={to}
        className={cn(classes, 'rounded-md focus-visible:outline-2 focus-visible:outline-offset-4')}
        aria-label="SlotEase home"
      >
        {content}
      </Link>
    )
  }
  return <span className={classes}>{content}</span>
}
