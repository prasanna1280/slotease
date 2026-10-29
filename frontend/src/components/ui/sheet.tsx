import * as SheetPrimitive from '@radix-ui/react-dialog'
import { cva, type VariantProps } from 'class-variance-authority'
import { X } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/** Side panel built on Radix Dialog (used for the mobile navigation drawer and side forms). */
export const Sheet = SheetPrimitive.Root
export const SheetTrigger = SheetPrimitive.Trigger
export const SheetClose = SheetPrimitive.Close
export const SheetPortal = SheetPrimitive.Portal

export function SheetOverlay({ className, ...props }: ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      className={cn('fixed inset-0 z-50 bg-slate-900/50 data-[state=open]:animate-fade-in', className)}
      {...props}
    />
  )
}

const sheetVariants = cva('fixed z-50 flex flex-col bg-card shadow-lg focus:outline-none', {
  variants: {
    side: {
      left: 'inset-y-0 left-0 h-dvh w-[85%] max-w-xs border-r border-border pt-safe pb-safe pl-safe data-[state=open]:animate-sheet-left',
      right:
        'inset-y-0 right-0 h-dvh w-[85%] max-w-sm border-l border-border pt-safe pr-safe pb-safe data-[state=open]:animate-sheet-right',
      bottom:
        'inset-x-0 bottom-0 max-h-[85dvh] rounded-t-lg border-t border-border pb-safe data-[state=open]:animate-sheet-bottom',
    },
  },
  defaultVariants: { side: 'right' },
})

export interface SheetContentProps
  extends ComponentProps<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  hideClose?: boolean
}

export function SheetContent({ side, className, children, hideClose = false, ...props }: SheetContentProps) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content className={cn(sheetVariants({ side }), className)} {...props}>
        {children}
        {!hideClose && (
          <SheetPrimitive.Close
            className="absolute top-[max(0.5rem,env(safe-area-inset-top))] right-2 inline-flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            aria-label="Close"
          >
            <X className="size-5" aria-hidden="true" />
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

export function SheetHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1 border-b border-border px-4 py-4 pr-14', className)} {...props} />
}

export function SheetFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mt-auto flex flex-col gap-2 border-t border-border p-4', className)} {...props} />
}

export function SheetTitle({ className, ...props }: ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title className={cn('text-base font-semibold text-foreground', className)} {...props} />
}

export function SheetDescription({ className, ...props }: ComponentProps<typeof SheetPrimitive.Description>) {
  return <SheetPrimitive.Description className={cn('text-sm text-muted-foreground', className)} {...props} />
}
