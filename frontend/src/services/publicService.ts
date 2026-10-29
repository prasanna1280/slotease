import { api } from '@/services/api'
import type {
  BookingConfirmationOut,
  BookingCreate,
  PublicBusinessOut,
  PublicServiceOut,
  SlotsOut,
  SlotsQuery,
} from '@/types/api'

const base = (slug: string) => `/public/${encodeURIComponent(slug)}`

/** Unauthenticated endpoints used by the customer booking page. */
export const publicService = {
  async getBusiness(slug: string): Promise<PublicBusinessOut> {
    return (await api.get<PublicBusinessOut>(base(slug))).data
  },

  async listServices(slug: string): Promise<PublicServiceOut[]> {
    return (await api.get<PublicServiceOut[]>(`${base(slug)}/services`)).data
  },

  async getSlots(slug: string, query: SlotsQuery): Promise<SlotsOut> {
    return (await api.get<SlotsOut>(`${base(slug)}/slots`, { params: query })).data
  },

  async createBooking(slug: string, data: BookingCreate): Promise<BookingConfirmationOut> {
    return (await api.post<BookingConfirmationOut>(`${base(slug)}/bookings`, data)).data
  },
}
