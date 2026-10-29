import type { ReactNode } from 'react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export interface FieldProps {
  /** Must match the `id` of the control inside. */
  htmlFor: string
  label: ReactNode
  /** Validation message shown under the control (red, announced). */
  error?: string
  /** Helper text shown under the control when there is no error. */
  hint?: ReactNode
  /** Appends "(optional)" to the label. */
  optional?: boolean
  className?: string
  children: ReactNode
}

/**
 * Label + control + hint/error. Give the control `aria-invalid={!!error}` and
 * `aria-describedby={fieldDescriptionId(id)}` so the message is read with it.
 */
export function Field({ htmlFor, label, error, hint, optional, className, children }: FieldProps) {
  const descriptionId = fieldDescriptionId(htmlFor)
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {optional && <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}
      </Label>
      {children}
      {error ? (
        <p id={descriptionId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={descriptionId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

/** The id used by `Field` for its hint / error element. */
export function fieldDescriptionId(htmlFor: string): string {
  return `${htmlFor}-description`
}
