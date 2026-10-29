import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts'
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent'
import { formatDate } from '@/lib/datetime'
import type { DailyStat } from '@/types/api'

/* Chart colours come from the design tokens (primary blue-700, slate grid/axis). Single solid series, no gradients. */
const BAR_COLOR = '#1d4ed8'
const GRID_COLOR = '#e2e8f0'
const AXIS_COLOR = '#64748b'

interface ChartDatum {
  date: string
  day: number
  bookings: number
  completed: number
  no_shows: number
}

function ChartTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  const datum = payload?.[0]?.payload as ChartDatum | undefined
  if (!active || !datum) return null
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-foreground">{formatDate(datum.date)}</p>
      <p className="text-foreground tabular-nums">
        <span className="font-semibold">{datum.bookings}</span> bookings
      </p>
      <p className="text-muted-foreground tabular-nums">
        {datum.completed} completed · {datum.no_shows} no-shows
      </p>
    </div>
  )
}

/** Daily bookings for a month as a single-colour bar chart. */
export function DailyBookingsChart({ daily }: { daily: DailyStat[] }) {
  const data: ChartDatum[] = daily.map((d) => ({ ...d, day: Number(d.date.slice(8, 10)) }))
  const total = daily.reduce((sum, d) => sum + d.bookings, 0)
  const peak = daily.reduce<DailyStat | null>((best, d) => (!best || d.bookings > best.bookings ? d : best), null)

  return (
    <figure>
      <div className="h-64 w-full sm:h-72" role="img" aria-label={`Daily bookings bar chart, ${total} bookings in total`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid vertical={false} stroke={GRID_COLOR} />
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={{ stroke: GRID_COLOR }}
              tick={{ fill: AXIS_COLOR, fontSize: 12 }}
              interval="preserveStartEnd"
              minTickGap={8}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={{ fill: AXIS_COLOR, fontSize: 12 }}
              width={40}
            />
            <Tooltip cursor={{ fill: '#f1f5f9' }} content={ChartTooltip} />
            <Bar dataKey="bookings" fill={BAR_COLOR} radius={[3, 3, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {peak && peak.bookings > 0 && (
        <figcaption className="mt-2 text-xs text-muted-foreground">
          Peak: {formatDate(peak.date)} with {peak.bookings} bookings.
        </figcaption>
      )}
    </figure>
  )
}
