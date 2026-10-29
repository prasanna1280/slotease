import type { ComponentProps } from 'react'
import { fieldClasses } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export type TextareaProps = ComponentProps<'textarea'>

export function Textarea({ className, rows = 3, ...props }: TextareaProps) {
  return <textarea rows={rows} className={cn(fieldClasses, 'min-h-20 py-2.5 leading-relaxed', className)} {...props} />
}
