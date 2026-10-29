import { isAxiosError } from 'axios'
import type { ApiErrorBody, ApiErrorDetail } from '@/types/api'

const DEFAULT_MESSAGE = 'Something went wrong. Please try again.'

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as { error: unknown }).error === 'string'
  )
}

/** The `{error, message, details}` body of a failed API call, if there is one. */
export function getErrorBody(err: unknown): ApiErrorBody | undefined {
  if (isAxiosError(err) && isApiErrorBody(err.response?.data)) return err.response.data
  return undefined
}

/** HTTP status of a failed API call, if any. */
export function getErrorStatus(err: unknown): number | undefined {
  return isAxiosError(err) ? err.response?.status : undefined
}

/** Machine-readable error code such as `SLOT_TAKEN`, `EMAIL_TAKEN`, `BUSINESS_INACTIVE`. */
export function getErrorCode(err: unknown): string | undefined {
  return getErrorBody(err)?.error
}

/** Field-level validation details (422) if the server returned them. */
export function getErrorDetails(err: unknown): ApiErrorDetail[] {
  return getErrorBody(err)?.details ?? []
}

/** Human-readable message for any thrown value: API message, network message, or a safe default. */
export function getErrorMessage(err: unknown, fallback: string = DEFAULT_MESSAGE): string {
  const body = getErrorBody(err)
  if (body?.message) return body.message

  if (isAxiosError(err)) {
    if (!err.response) return 'Unable to reach the server. Check your connection and try again.'
    const status = err.response.status
    if (status === 429) return 'Too many requests. Please try again shortly.'
    if (status >= 500) return 'The server ran into a problem. Please try again.'
    return fallback
  }

  if (err instanceof Error && err.message) return err.message
  return fallback
}
