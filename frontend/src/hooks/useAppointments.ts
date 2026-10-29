import { useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { appointmentService } from '@/services/appointmentService'
import type { AppointmentOut, AppointmentStatus, BookingCreate, CustomerDetailOut } from '@/types/api'

/** Invalidate everything that depends on appointments (lists, stats, customer aggregates, slots). */
export async function invalidateAppointmentData(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.stats.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.customers.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.slots.all }),
  ])
}

export function useDayAppointments(date: string) {
  return useQuery({
    queryKey: queryKeys.appointments.day(date),
    queryFn: () => appointmentService.listForDay(date),
  })
}

export function useRangeAppointments(start: string, end: string) {
  return useQuery({
    queryKey: queryKeys.appointments.range(start, end),
    queryFn: () => appointmentService.listRange(start, end),
  })
}

export function useCreateAppointment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: BookingCreate) => appointmentService.create(data),
    onSuccess: () => invalidateAppointmentData(queryClient),
  })
}

/** Free-slot suggestions for the owner "New booking" dialog (public endpoint, enforces notice). */
export function useOwnerSlots(slug: string, serviceId: number | null, date: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.slots.list(slug, serviceId ?? 0, date),
    queryFn: () => appointmentService.freeSlots(slug, serviceId ?? 0, date),
    enabled: enabled && serviceId !== null && serviceId > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date),
    staleTime: 10_000,
  })
}

export interface StatusVariables {
  id: number
  status: AppointmentStatus
}

type Snapshot = Array<[QueryKey, unknown]>

function isAppointmentList(data: unknown): data is AppointmentOut[] {
  return Array.isArray(data)
}

function isCustomerDetail(data: unknown): data is CustomerDetailOut {
  return typeof data === 'object' && data !== null && 'appointments' in data
}

/** Return a copy of a cached value with appointment `id` set to `status` (lists and customer detail). */
export function patchAppointmentStatus(data: unknown, id: number, status: AppointmentStatus): unknown {
  if (isAppointmentList(data)) return data.map((a) => (a.id === id ? { ...a, status } : a))
  if (isCustomerDetail(data)) {
    return { ...data, appointments: data.appointments.map((a) => (a.id === id ? { ...a, status } : a)) }
  }
  return data
}

/**
 * Change an appointment's status with an optimistic update across every cached appointment list
 * (day, range, customer history). Rolls back on error; refetches dependent data when settled.
 */
export function useUpdateAppointmentStatus() {
  const queryClient = useQueryClient()
  return useMutation<AppointmentOut, unknown, StatusVariables, { snapshot: Snapshot }>({
    mutationFn: ({ id, status }) => appointmentService.update(id, { status }),
    onMutate: async ({ id, status }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: queryKeys.appointments.all }),
        queryClient.cancelQueries({ queryKey: queryKeys.customers.all }),
      ])
      const snapshot: Snapshot = [
        ...queryClient.getQueriesData({ queryKey: queryKeys.appointments.all }),
        ...queryClient.getQueriesData({ queryKey: [...queryKeys.customers.all, 'detail'] }),
      ]
      for (const [key, data] of snapshot) {
        if (data !== undefined) queryClient.setQueryData(key, patchAppointmentStatus(data, id, status))
      }
      return { snapshot }
    },
    onError: (_err, _vars, context) => {
      for (const [key, data] of context?.snapshot ?? []) queryClient.setQueryData(key, data)
    },
    onSettled: () => invalidateAppointmentData(queryClient),
  })
}
