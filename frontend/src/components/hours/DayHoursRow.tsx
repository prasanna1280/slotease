import { Coffee, Plus, Trash2 } from 'lucide-react'
import { addBreak, MAX_RANGES_PER_DAY, newDefaultRange, type DayErrors, type DayHours } from '@/components/hours/hours-model'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { weekdayName } from '@/lib/datetime'
import { cn } from '@/lib/utils'

export interface DayHoursRowProps {
  day: DayHours
  errors?: DayErrors
  /** Show errors only after the first save attempt. */
  showErrors: boolean
  onChange: (day: DayHours) => void
}

export function DayHoursRow({ day, errors, showErrors, onChange }: DayHoursRowProps) {
  const name = weekdayName(day.weekday)
  const switchId = `day-${day.weekday}-open`
  const dayError = showErrors ? errors?.day : undefined

  const updateRange = (index: number, field: 'open' | 'close', value: string) => {
    onChange({ ...day, ranges: day.ranges.map((r, i) => (i === index ? { ...r, [field]: value } : r)) })
  }
  const removeRange = (index: number) => {
    const ranges = day.ranges.filter((_, i) => i !== index)
    onChange(ranges.length === 0 ? { ...day, enabled: false, ranges: [newDefaultRange()] } : { ...day, ranges })
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:px-5 md:flex-row md:items-start md:gap-6">
      <div className="flex min-h-11 items-center gap-3 md:w-44 md:shrink-0">
        <Switch
          id={switchId}
          checked={day.enabled}
          onCheckedChange={(enabled) =>
            onChange({ ...day, enabled, ranges: day.ranges.length > 0 ? day.ranges : [newDefaultRange()] })
          }
          aria-label={`${name} open`}
        />
        <label htmlFor={switchId} className="text-sm font-medium text-foreground">
          {name}
        </label>
      </div>

      {!day.enabled ? (
        <p className="flex min-h-11 items-center text-sm text-muted-foreground md:min-h-10">Closed</p>
      ) : (
        <div className="min-w-0 flex-1 space-y-2">
          {day.ranges.map((r, i) => {
            const rangeError = showErrors ? errors?.ranges[i] : undefined
            const errorId = `day-${day.weekday}-range-${i}-error`
            return (
              <div key={r.key}>
                <div className="flex items-center gap-2">
                  <label htmlFor={`${r.key}-open`} className="sr-only">
                    {name} range {i + 1} opens
                  </label>
                  <Input
                    id={`${r.key}-open`}
                    type="time"
                    step={900}
                    value={r.open}
                    onChange={(e) => updateRange(i, 'open', e.target.value)}
                    aria-invalid={!!rangeError}
                    aria-describedby={rangeError ? errorId : undefined}
                    className="w-full min-w-0 tabular-nums sm:w-36"
                  />
                  <span className="text-sm text-muted-foreground" aria-hidden="true">
                    to
                  </span>
                  <label htmlFor={`${r.key}-close`} className="sr-only">
                    {name} range {i + 1} closes
                  </label>
                  <Input
                    id={`${r.key}-close`}
                    type="time"
                    step={900}
                    value={r.close}
                    onChange={(e) => updateRange(i, 'close', e.target.value)}
                    aria-invalid={!!rangeError}
                    aria-describedby={rangeError ? errorId : undefined}
                    className="w-full min-w-0 tabular-nums sm:w-36"
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeRange(i)}
                    aria-label={`Remove ${name} range ${i + 1}`}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
                {rangeError && (
                  <p id={errorId} role="alert" className="mt-1 text-sm text-destructive">
                    {rangeError}
                  </p>
                )}
              </div>
            )
          })}

          {dayError && (
            <p role="alert" className="text-sm text-destructive">
              {dayError}
            </p>
          )}

          <div className={cn('flex flex-wrap gap-x-4', day.ranges.length >= MAX_RANGES_PER_DAY && 'hidden')}>
            <Button variant="link" size="sm" onClick={() => onChange(addBreak(day))} className="min-h-11 sm:min-h-0">
              <Coffee aria-hidden="true" />
              Add break
            </Button>
            {day.ranges.length === 0 && (
              <Button
                variant="link"
                size="sm"
                onClick={() => onChange({ ...day, ranges: [newDefaultRange()] })}
                className="min-h-11 sm:min-h-0"
              >
                <Plus aria-hidden="true" />
                Add hours
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
