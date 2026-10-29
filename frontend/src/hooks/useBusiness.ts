import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { queryKeys } from '@/lib/queryKeys'
import { authService } from '@/services/authService'
import { businessService } from '@/services/businessService'
import type { BusinessUpdate, ChangePasswordRequest, DeleteBusinessRequest, UpdateMeRequest } from '@/types/api'

/** PATCH /business, then push the result into AuthContext so AppShell banners and links update. */
export function useUpdateBusiness() {
  const { setBusiness } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: BusinessUpdate) => businessService.update(data),
    onSuccess: (business) => {
      setBusiness(business)
      queryClient.setQueryData(queryKeys.business, business)
      // Timezone and booking rules change day boundaries and slot suggestions.
      void queryClient.invalidateQueries({ queryKey: queryKeys.slots.all })
      void queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all })
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats.all })
    },
  })
}

export function useUpdateAccount() {
  const { setUser } = useAuth()
  return useMutation({
    mutationFn: (data: UpdateMeRequest) => authService.updateMe(data),
    onSuccess: (user) => setUser(user),
  })
}

export function useChangePassword() {
  return useMutation({ mutationFn: (data: ChangePasswordRequest) => authService.changePassword(data) })
}

/** DELETE /business. The caller signs out afterwards (the account and its sessions no longer exist). */
export function useDeleteBusiness() {
  return useMutation({ mutationFn: (data: DeleteBusinessRequest) => businessService.remove(data) })
}
