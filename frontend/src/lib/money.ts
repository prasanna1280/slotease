const formatterCache = new Map<string, Intl.NumberFormat>()

function getFormatter(currency: string, fractionDigits: number): Intl.NumberFormat {
  const key = `${currency}:${fractionDigits}`
  let formatter = formatterCache.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    })
    formatterCache.set(key, formatter)
  }
  return formatter
}

/** Parse an API decimal string ("450.00") or number into a finite number (0 on bad input). */
export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0
  const n = typeof value === 'number' ? value : Number.parseFloat(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * Format money for display using Indian digit grouping.
 * Whole amounts drop the decimals ("₹6,450"); fractional amounts keep two ("₹99.50").
 */
export function formatMoney(value: string | number | null | undefined, currency = 'INR'): string {
  const n = toNumber(value)
  const fractionDigits = Number.isInteger(n) ? 0 : 2
  return getFormatter(currency, fractionDigits).format(n)
}
