import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { queryKeys } from '@/lib/queryKeys'
import { customerService } from '@/services/customerService'
import type { CustomersQuery } from '@/types/api'

export function useCustomers(query: CustomersQuery) {
  return useQuery({
    queryKey: queryKeys.customers.list(query),
    queryFn: () => customerService.list(query),
    placeholderData: keepPreviousData,
  })
}

export function useCustomer(id: number) {
  return useQuery({
    queryKey: queryKeys.customers.detail(id),
    queryFn: () => customerService.get(id),
    enabled: Number.isInteger(id) && id > 0,
  })
}

/** Returns `value` once it has stopped changing for `delayMs`. */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}
