import axios, { AxiosError, AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStorage } from '@/lib/tokenStorage'
import { AUTH_LOGOUT_EVENT, api } from '@/services/api'

/** Build an adapter that answers each URL with a fixed status (and an AuthOut body for 200s). */
function adapterFor(statusByPath: Record<string, number>): AxiosAdapter {
  return (config: InternalAxiosRequestConfig) => {
    const path = Object.keys(statusByPath).find((p) => config.url?.includes(p)) ?? ''
    const status = statusByPath[path] ?? 500
    const response = {
      data:
        status === 200
          ? { access_token: 'new-access', refresh_token: 'new-refresh', user: null, business: null }
          : { error: 'X', message: 'x' },
      status,
      statusText: String(status),
      headers: {},
      config,
    }
    if (status < 400) return Promise.resolve(response)
    return Promise.reject(new AxiosError('fail', String(status), config, null, response))
  }
}

describe('api client silent refresh', () => {
  const originalApiAdapter = api.defaults.adapter
  const originalAxiosAdapter = axios.defaults.adapter
  const onLogout = vi.fn()

  beforeEach(() => {
    tokenStorage.setTokens('old-access', 'old-refresh')
    window.addEventListener(AUTH_LOGOUT_EVENT, onLogout)
  })

  afterEach(() => {
    api.defaults.adapter = originalApiAdapter
    axios.defaults.adapter = originalAxiosAdapter
    window.removeEventListener(AUTH_LOGOUT_EVENT, onLogout)
    onLogout.mockReset()
    tokenStorage.clear()
  })

  it('signs out when the refresh token is rejected (401)', async () => {
    api.defaults.adapter = adapterFor({ '/appointments': 401 })
    axios.defaults.adapter = adapterFor({ '/auth/refresh': 401 })

    await expect(api.get('/appointments')).rejects.toBeInstanceOf(AxiosError)
    expect(onLogout).toHaveBeenCalledTimes(1)
    expect(tokenStorage.getRefreshToken()).toBeNull()
  })

  it.each([429, 503])('keeps the session when refresh fails with %i', async (status) => {
    api.defaults.adapter = adapterFor({ '/appointments': 401 })
    axios.defaults.adapter = adapterFor({ '/auth/refresh': status })

    await expect(api.get('/appointments')).rejects.toBeInstanceOf(AxiosError)
    expect(onLogout).not.toHaveBeenCalled()
    expect(tokenStorage.getRefreshToken()).toBe('old-refresh')
  })

  it('retries the original request with the new access token', async () => {
    const seen: string[] = []
    api.defaults.adapter = (config) => {
      const auth = AxiosHeaders.from(config.headers).get('Authorization')
      seen.push(String(auth))
      return adapterFor({ '/appointments': auth === 'Bearer new-access' ? 200 : 401 })(config)
    }
    axios.defaults.adapter = adapterFor({ '/auth/refresh': 200 })

    await expect(api.get('/appointments')).resolves.toMatchObject({ status: 200 })
    expect(seen).toEqual(['Bearer old-access', 'Bearer new-access'])
    expect(tokenStorage.getRefreshToken()).toBe('new-refresh')
  })
})
