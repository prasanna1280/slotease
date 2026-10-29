import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts'
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent'

/* Same tokens as the owner Reports chart: one solid primary series, slate grid and axes, no gradients. */
const BAR_COLOR = '#1d4ed8'
const GRID_COLOR = '#e2e8f0'
const AXIS_COLOR = '#64748b'

export interface BarDatum {
  label: string
  value: number
  /** Extra lines for the hover tooltip, e.g. "3 payments". */
  details?: string[]
}

function makeTooltip(format: (value: number) => string) {
  return function AdminChartTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
    const datum = payload?.[0]?.payload as BarDatum | undefined
    if (!active || !datum) return null
    return (
      <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md">
        <p className="mb-1 font-medium text-foreground">{datum.label}</p>
        <p className="font-semibold text-foreground tabular-nums">{format(datum.value)}</p>
        {datum.details?.map((line) => (
          <p key={line} className="text-muted-foreground tabular-nums">
            {line}
          </p>
        ))}
      </div>
    )
  }
}

/** Single-series bar chart with hover tooltips. Pair it with a table of the same numbers. */
export function AdminBarChart({
  data,
  ariaLabel,
  formatValue = (v) => String(v),
  formatAxis,
  integer = false,
}: {
  data: BarDatum[]
  ariaLabel: string
  formatValue?: (value: number) => string
  formatAxis?: (value: number) => string
  integer?: boolean
}) {
  return (
    <div className="h-64 w-full sm:h-72" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID_COLOR} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: GRID_COLOR }}
            tick={{ fill: AXIS_COLOR, fontSize: 12 }}
            interval="preserveStartEnd"
            minTickGap={12}
          />
          <YAxis
            allowDecimals={!integer}
            tickLine={false}
            axisLine={false}
            tick={{ fill: AXIS_COLOR, fontSize: 12 }}
            tickFormatter={formatAxis ?? formatValue}
            width={64}
          />
          <Tooltip cursor={{ fill: '#f1f5f9' }} content={makeTooltip(formatValue)} />
          <Bar dataKey="value" fill={BAR_COLOR} radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
