/**
 * Axios client for the Waiter App.
 *
 * - Attaches JWT token from localStorage on every request
 * - The access token only lasts 15 minutes. On a 401 (expired token), this
 *   client uses the longer-lived refresh token to get a new one and quietly
 *   retries the request — so a waiter isn't logged out just from not tapping
 *   anything for a few minutes. Only a truly invalid session goes to /login.
 * - Retries once on 5xx errors
 * - Throws structured errors so stores can handle them cleanly
 */

import axios, { AxiosError } from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1'

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

// ── Request interceptor — attach token ───────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('waiter_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

function goToLogin() {
  localStorage.removeItem('waiter_token')
  localStorage.removeItem('waiter_refresh_token')
  window.location.href = '/login'
}

// Only one refresh happens at a time; other requests that 401 while it's in
// flight wait for the same result instead of each starting their own.
let refreshing: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('waiter_refresh_token')
  if (!refreshToken) return null
  try {
    const res = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken })
    const { token, refreshToken: nextRefreshToken } = res.data.data
    setToken(token, nextRefreshToken)
    return token
  } catch {
    return null
  }
}

// ── Response interceptor — handle errors ─────────────────────────────────────
api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as any

    if (error.response?.status === 401 && !original._retriedAfterRefresh) {
      original._retriedAfterRefresh = true
      refreshing ??= refreshAccessToken().finally(() => { refreshing = null })
      const newToken = await refreshing
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`
        return api(original)
      }
      goToLogin()
      return Promise.reject(error)
    }

    // Retry once on server errors
    if (error.response?.status && error.response.status >= 500 && !original._retry) {
      original._retry = true
      return api(original)
    }

    return Promise.reject(error)
  },
)

export function getErrorMessage(err: any): string {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.error?.message || err.message || 'Request failed'
  }
  return String(err)
}

export function setToken(token: string | null, refreshToken?: string | null) {
  if (token) {
    localStorage.setItem('waiter_token', token)
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`
  } else {
    localStorage.removeItem('waiter_token')
    delete api.defaults.headers.common['Authorization']
  }
  if (refreshToken !== undefined) {
    if (refreshToken) localStorage.setItem('waiter_refresh_token', refreshToken)
    else localStorage.removeItem('waiter_refresh_token')
  }
}

export function getRefreshToken(): string | null {
  return localStorage.getItem('waiter_refresh_token')
}
