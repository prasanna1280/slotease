import { AxiosError, AxiosHeaders, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import type { ApiErrorBody } from '@/types/api'

/** Build an AxiosError carrying a SlotEase `{error, message, details?}` body. */
export function apiError(status: number, body: ApiErrorBody): AxiosError<ApiErrorBody> {
  const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig
  const response: AxiosResponse<ApiErrorBody> = {
    data: body,
    status,
    statusText: String(status),
    headers: {},
    config,
  }
  return new AxiosError(body.message, String(status), config, undefined, response)
}
