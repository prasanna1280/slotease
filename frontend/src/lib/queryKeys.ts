import type { CustomersQuery } from '@/types/api'

/**
 * Centralised TanStack Query keys for the owner app. Keys are hierarchical so a mutation can
 * invalidate a whole family (e.g. `queryKeys.appointments.all` covers every day and range list).
 */
export const queryKeys = {
  business: ['business'] as const,
  appointments: {
    all: ['appointments'] as const,
    day: (date: string) => ['appointments', 'day', date] as const,
    range: (start: string, end: string) => ['appointments', 'range', start, end] as const,
    detail: (id: number) => ['appointments', 'detail', id] as const,
  },
  slots: {
    all: ['owner-slots'] as const,
    list: (slug: string, serviceId: number, date: string) => ['owner-slots', slug, serviceId, date] as const,
  },
  stats: {
    all: ['stats'] as const,
    summary: (date: string) => ['stats', 'summary', date] as const,
    month: (month: string) => ['stats', 'month', month] as const,
  },
  services: {
    all: ['services'] as const,
    list: (includeInactive: boolean) => ['services', 'list', { includeInactive }] as const,
  },
  workingHours: ['working-hours'] as const,
  customers: {
    all: ['customers'] as const,
    list: (query: CustomersQuery) => ['customers', 'list', query] as const,
    detail: (id: number) => ['customers', 'detail', id] as const,
  },
  billing: ['billing'] as const,
} as const
