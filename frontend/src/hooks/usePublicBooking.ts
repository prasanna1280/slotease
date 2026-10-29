import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { publicService } from '@/services/publicService'
import type { BookingCreate } from '@/types/api'

export const publicKeys = {
  all: ['public'] as const,
  business: (slug: string) => ['public', slug, 'business'] as const,
  services: (slug: string) => ['public', slug, 'services'] as const,
  slotsAll: (slug: string) => ['public', slug, 'slots'] as const,
  slots: (slug: string, serviceId: number, date: string) => ['public', slug, 'slots', serviceId, date] as const,
}

export function usePublicBusiness(slug: string) {
  return useQuery({
    queryKey: publicKeys.business(slug),
    queryFn: () => publicService.getBusiness(slug),
    staleTime: 5 * 60_000,
  })
}

export function usePublicServices(slug: string, enabled = true) {
  return useQuery({
    queryKey: publicKeys.services(slug),
    queryFn: () => publicService.listServices(slug),
    staleTime: 5 * 60_000,
    enabled,
  })
}

/** Free slots for one service on one date. Slots change quickly, so they are always refetched on mount. */
export function usePublicSlots(slug: string, serviceId: number | null, date: string | null) {
  return useQuery({
    queryKey: publicKeys.slots(slug, serviceId ?? 0, date ?? ''),
    queryFn: () => publicService.getSlots(slug, { service_id: serviceId ?? 0, date: date ?? '' }),
    enabled: serviceId !== null && date !== null,
    staleTime: 15_000,
  })
}

export function useCreateBooking(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: BookingCreate) => publicService.createBooking(slug, data),
    onSettled: () => queryClient.invalidateQueries({ queryKey: publicKeys.slotsAll(slug) }),
  })
}

/** Force-refetch every cached slot list for this business (e.g. after SLOT_TAKEN). */
export function useRefreshSlots(slug: string) {
  const queryClient = useQueryClient()
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: publicKeys.slotsAll(slug) }),
    [queryClient, slug],
  )
}
