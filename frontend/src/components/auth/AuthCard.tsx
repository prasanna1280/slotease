import type { ReactNode } from 'react'
import { Logo } from '@/components/layout/Logo'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { cn } from '@/lib/utils'

export interface AuthCardProps {
  title: string
  description?: ReactNode
  /** Content under the card (e.g. "Don't have an account? Sign up"). */
  footer?: ReactNode
  /** Wider card for longer forms (register). */
  wide?: boolean
  children: ReactNode
}

/** Centred auth card inside the public layout: logo, page heading, form, footer link. */
export function AuthCard({ title, description, footer, wide = false, children }: AuthCardProps) {
  return (
    <PublicLayout hideAuthActions className="items-center justify-start px-4 py-8 sm:justify-center sm:py-12">
      <div className={cn('w-full', wide ? 'max-w-lg' : 'max-w-md')}>
        <div className="rounded-lg border border-border bg-card px-5 py-7 shadow-sm sm:px-8 sm:py-9">
          <div className="mb-6 flex flex-col items-center text-center">
            <Logo iconOnly size="lg" className="mb-4" />
            <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{title}</h1>
            {description && <div className="mt-1.5 text-sm text-muted-foreground">{description}</div>}
          </div>
          {children}
        </div>
        {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
      </div>
    </PublicLayout>
  )
}
