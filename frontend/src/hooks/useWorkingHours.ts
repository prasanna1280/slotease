import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { hoursService } from '@/services/hoursService'
import type { WorkingHoursRange } from '@/types/api'

export function useWorkingHours() {
  return useQuery({ queryKey: queryKeys.workingHours, queryFn: hoursService.list })
}

export function useSaveWorkingHours() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (hours: WorkingHoursRange[]) => hoursService.replace(hours),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.workingHours, saved)
      void queryClient.invalidateQueries({ queryKey: queryKeys.slots.all })
    },
  })
}
