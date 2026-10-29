import type { FormEventHandler, ReactNode } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export interface FormCardProps {
  title: string
  description?: ReactNode
  onSubmit: FormEventHandler<HTMLFormElement>
  submitLabel?: string
  pending?: boolean
  /** Disable Save when there is nothing to save. */
  dirty?: boolean
  onReset?: () => void
  rootError?: string
  children: ReactNode
}

/** Settings section: card with a form body and a Save / Discard footer. */
export function FormCard({
  title,
  description,
  onSubmit,
  submitLabel = 'Save changes',
  pending = false,
  dirty = true,
  onReset,
  rootError,
  children,
}: FormCardProps) {
  return (
    <Card className="max-w-3xl">
      <form onSubmit={onSubmit} noValidate>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-4">
          {rootError && (
            <Alert variant="destructive">
              <AlertDescription>{rootError}</AlertDescription>
            </Alert>
          )}
          {children}
        </CardContent>
        <CardFooter className="flex-col-reverse items-stretch gap-2 sm:flex-row sm:justify-end">
          {onReset && (
            <Button variant="outline" onClick={onReset} disabled={!dirty || pending}>
              Discard
            </Button>
          )}
          <Button type="submit" loading={pending} disabled={!dirty}>
            {submitLabel}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
