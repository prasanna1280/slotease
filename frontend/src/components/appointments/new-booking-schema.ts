import { z } from 'zod'
import { phoneSchema } from '@/lib/validation'

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/

/** Owner "New booking" form. Either a suggested `slot` (ISO) or a `custom_time` (HH:MM) is required. */
export const newBookingSchema = z
  .object({
    service_id: z.string().min(1, 'Choose a service.'),
    date: z.string().regex(YMD_RE, 'Choose a date.'),
    slot: z.string(),
    custom_time: z.string(),
    customer_name: z
      .string()
      .trim()
      .min(1, "Enter the customer's name.")
      .max(120, 'Name must be at most 120 characters.'),
    customer_phone: phoneSchema,
    customer_email: z
      .string()
      .trim()
      .max(255, 'Email is too long.')
      .refine((v) => v === '' || z.email().safeParse(v).success, 'Enter a valid email address.'),
    notes: z.string().trim().max(500, 'Notes must be at most 500 characters.'),
  })
  .superRefine((v, ctx) => {
    if (!v.slot && !v.custom_time) {
      ctx.addIssue({ code: 'custom', path: ['custom_time'], message: 'Pick a free slot or enter a custom time.' })
    } else if (!v.slot && !HHMM_RE.test(v.custom_time)) {
      ctx.addIssue({ code: 'custom', path: ['custom_time'], message: 'Enter a time such as 14:30.' })
    }
  })

export type NewBookingValues = z.infer<typeof newBookingSchema>
