import { CopyCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import { toast } from 'sonner'
import { DayHoursRow } from '@/components/hours/DayHoursRow'
import {
  copyMondayToWeekdays,
  hoursFromApi,
  hoursSignature,
  hoursToApi,
  validateHours,
  type DayHours,
} from '@/components/hours/hours-model'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useSaveWorkingHours } from '@/hooks/useWorkingHours'
import { getErrorMessage } from '@/lib/errors'
import type { WorkingHoursOut } from '@/types/api'

export interface WorkingHoursEditorProps {
  initial: WorkingHoursOut[]
  timezone: string
}

export function WorkingHoursEditor({ initial, timezone }: WorkingHoursEditorProps) {
  const [days, setDays] = useState<DayHours[]>(() => hoursFromApi(initial))
  const [baseline, setBaseline] = useState(() => hoursSignature(hoursFromApi(initial)))
  const [attempted, setAttempted] = useState(false)
  const save = useSaveWorkingHours()

  const { valid, errors } = useMemo(() => validateHours(days), [days])
  const dirty = hoursSignature(days) !== baseline

  // Guard in-app navigation and tab close while there are unsaved changes.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const updateDay = (next: DayHours) => setDays((prev) => prev.map((d) => (d.weekday === next.weekday ? next : d)))

  const onSave = () => {
    setAttempted(true)
    if (!valid) {
      toast.error('Fix the highlighted times before saving.')
      return
    }
    save.mutate(hoursToApi(days), {
      onSuccess: (saved) => {
        const next = hoursFromApi(saved)
        setDays(next)
        setBaseline(hoursSignature(next))
        setAttempted(false)
        toast.success('Working hours saved')
      },
      onError: (err) => toast.error(getErrorMessage(err, 'Could not save working hours.')),
    })
  }

  const onDiscard = () => {
    const reset = hoursFromApi(initial)
    setDays(reset)
    setBaseline(hoursSignature(reset))
    setAttempted(false)
  }

  const closedAll = days.every((d) => !d.enabled)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Times are in <span className="font-medium text-foreground">{timezone}</span>. Customers can only book inside
          these hours.
        </p>
        <Button variant="outline" onClick={() => setDays((prev) => copyMondayToWeekdays(prev))}>
          <CopyCheck aria-hidden="true" />
          Copy Monday to weekdays
        </Button>
      </div>

      {closedAll && (
        <Alert variant="warning">
          <AlertDescription>All days are closed, so customers cannot book online.</AlertDescription>
        </Alert>
      )}

      <Card className="divide-y divide-border">
        {days.map((day) => (
          <DayHoursRow
            key={day.weekday}
            day={day}
            errors={errors[day.weekday]}
            showErrors={attempted}
            onChange={updateDay}
          />
        ))}
      </Card>

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-card px-4 py-3 pb-safe-4 sm:static sm:mx-0 sm:rounded-lg sm:border sm:pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {dirty ? 'You have unsaved changes.' : 'All changes saved.'}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onDiscard} disabled={!dirty || save.isPending} className="flex-1 sm:flex-none">
              Discard
            </Button>
            <Button onClick={onSave} disabled={!dirty} loading={save.isPending} className="flex-1 sm:flex-none">
              Save hours
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => {
          if (!open && blocker.state === 'blocked') blocker.reset()
        }}
        title="Leave without saving?"
        description="Your changes to working hours will be lost."
        confirmLabel="Leave page"
        cancelLabel="Stay"
        variant="destructive"
        onConfirm={() => blocker.state === 'blocked' && blocker.proceed()}
      />
    </div>
  )
}
