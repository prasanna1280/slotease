import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { queryKeys } from '@/lib/queryKeys'
import { billingService } from '@/services/billingService'
import type { BillingOut, BillingVerifyRequest } from '@/types/api'

export function useBilling() {
  return useQuery({ queryKey: queryKeys.billing, queryFn: billingService.get })
}

/** After a billing change: cache the new BillingOut and refresh the business (AppShell banners). */
function useOnBillingChanged() {
  const queryClient = useQueryClient()
  const { refreshMe } = useAuth()
  return (billing: BillingOut) => {
    queryClient.setQueryData(queryKeys.billing, billing)
    void refreshMe().catch(() => undefined)
  }
}

export function useSubscribe() {
  return useMutation({ mutationFn: billingService.subscribe })
}

export function useVerifySubscription() {
  const onChanged = useOnBillingChanged()
  return useMutation({
    mutationFn: (data: BillingVerifyRequest) => billingService.verify(data),
    onSuccess: onChanged,
  })
}

export function useCancelSubscription() {
  const onChanged = useOnBillingChanged()
  return useMutation({ mutationFn: billingService.cancel, onSuccess: onChanged })
}
