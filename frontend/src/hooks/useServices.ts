import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { catalogService } from '@/services/catalogService'
import type { ServiceCreate, ServiceUpdate } from '@/types/api'

export function useServices(includeInactive = false) {
  return useQuery({
    queryKey: queryKeys.services.list(includeInactive),
    queryFn: () => catalogService.list(includeInactive),
  })
}

function useInvalidateServices() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.services.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.slots.all }),
    ])
}

export function useCreateService() {
  const invalidate = useInvalidateServices()
  return useMutation({
    mutationFn: (data: ServiceCreate) => catalogService.create(data),
    onSuccess: invalidate,
  })
}

export function useUpdateService() {
  const invalidate = useInvalidateServices()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: ServiceUpdate }) => catalogService.update(id, data),
    onSuccess: invalidate,
  })
}

/** Deactivate (DELETE keeps history) or reactivate (PATCH is_active=true). */
export function useSetServiceActive() {
  const invalidate = useInvalidateServices()
  return useMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) => {
      if (active) await catalogService.update(id, { is_active: true })
      else await catalogService.deactivate(id)
    },
    onSuccess: invalidate,
  })
}
