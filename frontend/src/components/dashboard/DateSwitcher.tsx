import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { addDays } from '@/lib/datetime'

export interface DateSwitcherProps {
  value: string
  today: string
  onChange: (ymd: string) => void
}

/** Previous / Today / Next plus a native date input for jumping to any day. */
export function DateSwitcher({ value, today, onChange }: DateSwitcherProps) {
  return (
    <div className="flex items-center gap-1.5">
      <Button variant="outline" size="icon" onClick={() => onChange(addDays(value, -1))} aria-label="Previous day">
        <ChevronLeft aria-hidden="true" />
      </Button>
      <Button variant="outline" onClick={() => onChange(today)} disabled={value === today}>
        Today
      </Button>
      <Button variant="outline" size="icon" onClick={() => onChange(addDays(value, 1))} aria-label="Next day">
        <ChevronRight aria-hidden="true" />
      </Button>
      <label htmlFor="dashboard-date" className="sr-only">
        Go to date
      </label>
      <Input
        id="dashboard-date"
        type="date"
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="w-auto min-w-0 flex-1 sm:w-40 sm:flex-none"
      />
    </div>
  )
}
