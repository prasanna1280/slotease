import { RefreshCw } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { getErrorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'

export interface QueryErrorAlertProps {
  error: unknown
  title?: string
  onRetry?: () => void
  retrying?: boolean
  className?: string
}

/** Standard error state for owner-app data views: message + Retry. */
export function QueryErrorAlert({ error, title = 'Could not load data', onRetry, retrying, className }: QueryErrorAlertProps) {
  return (
    <Alert variant="destructive" className={cn('items-start', className)}>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{getErrorMessage(error)}</AlertDescription>
      {onRetry && (
        <Button
          size="sm"
          variant="outline"
          className="mt-2 bg-card text-foreground"
          onClick={onRetry}
          loading={retrying}
        >
          {!retrying && <RefreshCw aria-hidden="true" />}
          Retry
        </Button>
      )}
    </Alert>
  )
}
