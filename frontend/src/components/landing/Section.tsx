import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface SectionProps {
  id?: string
  /** Accessible name source: id of the section heading. */
  labelledBy?: string
  className?: string
  /** Inner container classes. */
  innerClassName?: string
  children: ReactNode
}

/** Full-width landing section with the standard content container (max 1200px, responsive gutters). */
export function Section({ id, labelledBy, className, innerClassName, children }: SectionProps) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={cn('scroll-mt-16 py-16 sm:py-20 lg:py-24', className)}>
      <div className={cn('mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8', innerClassName)}>{children}</div>
    </section>
  )
}

export interface SectionHeaderProps {
  id: string
  eyebrow: string
  title: ReactNode
  description?: ReactNode
  align?: 'center' | 'left'
  className?: string
}

export function SectionHeader({ id, eyebrow, title, description, align = 'center', className }: SectionHeaderProps) {
  return (
    <div className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center', className)}>
      <p className="text-sm font-semibold text-primary">{eyebrow}</p>
      <h2 id={id} className="mt-2 text-2xl font-semibold tracking-tight text-balance text-foreground sm:text-3xl">
        {title}
      </h2>
      {description && (
        <p className="mt-3 text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">{description}</p>
      )}
    </div>
  )
}
