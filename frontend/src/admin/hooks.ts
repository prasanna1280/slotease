import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminService } from '@/admin/api'
import type {
  AppointmentSearchParams,
  Basis,
  BusinessListParams,
  BusinessUpdate,
  Granularity,
  ManualPaymentRequest,
  PaymentListParams,
} from '@/admin/types'
import type { AppointmentStatus } from '@/types/api'

export const adminKeys = {
  all: ['admin'] as const,
  overview: ['admin', 'overview'] as const,
  revenue: (granularity: Granularity, basis: Basis) => ['admin', 'revenue', granularity, basis] as const,
  subscriptions: ['admin', 'subscriptions'] as const,
  businesses: (params: BusinessListParams) => ['admin', 'businesses', params] as const,
  business: (id: number) => ['admin', 'business', id] as const,
  payments: (params: PaymentListParams) => ['admin', 'payments', params] as const,
  appointments: (params: AppointmentSearchParams) => ['admin', 'appointments', params] as const,
  audit: (page: number) => ['admin', 'audit', page] as const,
}

export function useAdminOverview() {
  return useQuery({ queryKey: adminKeys.overview, queryFn: adminService.overview })
}

export function useAdminRevenue(granularity: Granularity, basis: Basis) {
  return useQuery({
    queryKey: adminKeys.revenue(granularity, basis),
    queryFn: () => adminService.revenue(granularity, basis),
    placeholderData: keepPreviousData,
  })
}

export function useAdminSubscriptions() {
  return useQuery({ queryKey: adminKeys.subscriptions, queryFn: adminService.subscriptions })
}

export function useAdminBusinesses(params: BusinessListParams) {
  return useQuery({
    queryKey: adminKeys.businesses(params),
    queryFn: () => adminService.businesses(params),
    placeholderData: keepPreviousData,
  })
}

export function useAdminBusiness(id: number) {
  return useQuery({ queryKey: adminKeys.business(id), queryFn: () => adminService.business(id), enabled: id > 0 })
}

export function useAdminPayments(params: PaymentListParams) {
  return useQuery({
    queryKey: adminKeys.payments(params),
    queryFn: () => adminService.payments(params),
    placeholderData: keepPreviousData,
  })
}

export function useAdminAppointments(params: AppointmentSearchParams) {
  return useQuery({
    queryKey: adminKeys.appointments(params),
    queryFn: () => adminService.appointments(params),
    placeholderData: keepPreviousData,
  })
}

export function useAdminAudit(page: number) {
  return useQuery({
    queryKey: adminKeys.audit(page),
    queryFn: () => adminService.audit({ page }),
    placeholderData: keepPreviousData,
  })
}

/** After any admin change, every admin view may be stale (counts, revenue, audit log). */
function useInvalidateAdmin() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: adminKeys.all })
}

export function useUpdateBusiness(id: number) {
  const invalidate = useInvalidateAdmin()
  return useMutation({ mutationFn: (data: BusinessUpdate) => adminService.updateBusiness(id, data), onSuccess: invalidate })
}

export function useExtendTrial(id: number) {
  const invalidate = useInvalidateAdmin()
  return useMutation({ mutationFn: (days: number) => adminService.extendTrial(id, days), onSuccess: invalidate })
}

export function useRecordPayment(id: number) {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: (data: ManualPaymentRequest) => adminService.recordPayment(id, data),
    onSuccess: invalidate,
  })
}

export function useDeletePayment() {
  const invalidate = useInvalidateAdmin()
  return useMutation({ mutationFn: (paymentId: number) => adminService.deletePayment(paymentId), onSuccess: invalidate })
}

export function useOwnerResetLink(id: number) {
  const invalidate = useInvalidateAdmin()
  return useMutation({ mutationFn: (userId: number) => adminService.resetLink(id, userId), onSuccess: invalidate })
}

export function useViewAsOwner(id: number) {
  const invalidate = useInvalidateAdmin()
  return useMutation({ mutationFn: () => adminService.viewAs(id), onSuccess: invalidate })
}

export function useSignOutOwner(id: number) {
  const invalidate = useInvalidateAdmin()
  return useMutation({ mutationFn: (userId: number) => adminService.signOutOwner(id, userId), onSuccess: invalidate })
}

export function useDeleteBusiness(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (confirm: string) => adminService.deleteBusiness(id, confirm),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: adminKeys.business(id) })
      void queryClient.invalidateQueries({ queryKey: adminKeys.all })
    },
  })
}

export function useUpdateAppointmentStatus() {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: AppointmentStatus }) => adminService.updateAppointment(id, status),
    onSuccess: invalidate,
  })
}
