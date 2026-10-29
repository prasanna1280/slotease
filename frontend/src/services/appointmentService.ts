import { api } from '@/services/api'
import type {
  AppointmentOut,
  AppointmentStatus,
  AppointmentUpdate,
  BookingCreate,
  SlotsOut,
} from '@/types/api'

export const appointmentService = {
  async listForDay(date: string): Promise<AppointmentOut[]> {
    return (await api.get<AppointmentOut[]>('/appointments', { params: { date } })).data
  },

  /** Inclusive range, at most 42 days. */
  async listRange(start: string, end: string, status?: AppointmentStatus): Promise<AppointmentOut[]> {
    return (await api.get<AppointmentOut[]>('/appointments', { params: { start, end, status } })).data
  },

  async get(id: number): Promise<AppointmentOut> {
    return (await api.get<AppointmentOut>(`/appointments/${id}`)).data
  },

  /** Owner booking: no notice / booking-window rules (still must be within working hours). */
  async create(data: BookingCreate): Promise<AppointmentOut> {
    return (await api.post<AppointmentOut>('/appointments', data)).data
  },

  async update(id: number, data: AppointmentUpdate): Promise<AppointmentOut> {
    return (await api.patch<AppointmentOut>(`/appointments/${id}`, data)).data
  },

  /** Free slots via the public endpoint (enforces minimum notice). Used as suggestions in "New booking". */
  async freeSlots(slug: string, serviceId: number, date: string): Promise<SlotsOut> {
    return (
      await api.get<SlotsOut>(`/public/${encodeURIComponent(slug)}/slots`, {
        params: { service_id: serviceId, date },
      })
    ).data
  },
}
