import { z } from 'zod'
import { passwordSchema, phoneSchema, slugSchema } from '@/lib/validation'
import { SLOT_INTERVALS, type BusinessOut, type BusinessUpdate } from '@/types/api'

const intInRange = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(1, `Enter ${label}.`)
    .refine((v) => /^\d+$/.test(v), 'Use a whole number.')
    .refine((v) => Number(v) >= min && Number(v) <= max, `Must be between ${min} and ${max}.`)

/* ------------------------------------------------------------------ */
/* Business                                                            */
/* ------------------------------------------------------------------ */

export const businessSchema = z.object({
  name: z.string().trim().min(2, 'Business name must be at least 2 characters.').max(120, 'At most 120 characters.'),
  phone: phoneSchema,
  email: z
    .string()
    .trim()
    .max(255, 'Email is too long.')
    .refine((v) => v === '' || z.email().safeParse(v).success, 'Enter a valid email address.'),
  address: z.string().trim().max(255, 'Address must be at most 255 characters.'),
  timezone: z.string().min(1, 'Choose a timezone.'),
  slug: slugSchema,
})
export type BusinessFormValues = z.infer<typeof businessSchema>

export function businessToForm(b: BusinessOut): BusinessFormValues {
  return {
    name: b.name,
    phone: b.phone,
    email: b.email ?? '',
    address: b.address ?? '',
    timezone: b.timezone,
    slug: b.slug,
  }
}

export function businessFormToUpdate(v: BusinessFormValues): BusinessUpdate {
  return {
    name: v.name.trim(),
    phone: v.phone.trim(),
    email: v.email.trim() || null,
    address: v.address.trim() || null,
    timezone: v.timezone,
    slug: v.slug.trim().toLowerCase(),
  }
}

/* ------------------------------------------------------------------ */
/* Booking rules                                                       */
/* ------------------------------------------------------------------ */

export const rulesSchema = z.object({
  slot_interval_min: z
    .string()
    .refine((v) => (SLOT_INTERVALS as readonly number[]).includes(Number(v)), 'Choose a slot interval.'),
  booking_window_days: intInRange('the booking window', 1, 365),
  min_notice_minutes: intInRange('the minimum notice', 0, 10080),
})
export type RulesFormValues = z.infer<typeof rulesSchema>

export function rulesToForm(b: BusinessOut): RulesFormValues {
  return {
    slot_interval_min: String(b.slot_interval_min),
    booking_window_days: String(b.booking_window_days),
    min_notice_minutes: String(b.min_notice_minutes),
  }
}

/* ------------------------------------------------------------------ */
/* Account                                                             */
/* ------------------------------------------------------------------ */

export const profileSchema = z.object({
  full_name: z.string().trim().min(1, 'Enter your full name.').max(120, 'Name is too long.'),
})
export type ProfileFormValues = z.infer<typeof profileSchema>

export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, 'Enter your current password.'),
    new_password: passwordSchema,
    confirm: z.string().min(1, 'Confirm your new password.'),
  })
  .refine((v) => v.new_password === v.confirm, { message: 'Passwords do not match.', path: ['confirm'] })
  .refine((v) => v.new_password !== v.current_password || v.current_password === '', {
    message: 'Choose a password different from the current one.',
    path: ['new_password'],
  })
export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>

/** Delete-account confirmation: password plus the booking-page slug typed exactly (case-insensitive). */
export function deleteAccountSchema(slug: string) {
  return z.object({
    password: z.string().min(1, 'Enter your password.'),
    confirm: z
      .string()
      .refine((v) => v.trim().toLowerCase() === slug, { message: `Type ${slug} to confirm.` }),
  })
}
export type DeleteAccountFormValues = z.infer<ReturnType<typeof deleteAccountSchema>>
