/**
 * LAN server backend.
 *
 * Talks to a LabStock server over HTTP. Because the mobile app is a static
 * bundle served from `capacitor://` (iOS) or `http://localhost` (Android),
 * requests are cross-origin and cookies are unreliable — so the session token
 * is held here and sent as a bearer token instead.
 */

import { Preferences } from '@capacitor/preferences'

import { err, ok } from '@/core/types'
import type {
  DashboardData,
  InventoryBatch,
  NewBatchInput,
  NewProductInput,
  Product,
  ProductWithBatches,
  Result,
  UsageLogEntry,
} from '@/core/types'
import type { DataBackend, SessionUser } from './types'

const TOKEN_KEY = 'labstock.token'
const REQUEST_TIMEOUT_MS = 15_000

/** Normalise user input like `192.168.1.89` into a usable origin. */
export function normalizeServerUrl(input: string): string {
  let value = input.trim()
  if (!value) return ''
  if (!/^https?:\/\//i.test(value)) value = `http://${value}`
  value = value.replace(/\/+$/, '')

  try {
    const url = new URL(value)
    // A bare host with no port is almost always the dev server on :3000.
    if (!url.port && url.protocol === 'http:' && url.hostname !== 'localhost') {
      url.port = '3000'
    }
    return url.origin
  } catch {
    return ''
  }
}

export class RemoteBackend implements DataBackend {
  readonly mode = 'remote' as const

  private baseUrl: string
  private token: string | null = null
  private user: SessionUser | null = null

  constructor(serverUrl: string) {
    this.baseUrl = normalizeServerUrl(serverUrl)
  }

  setServerUrl(url: string) {
    this.baseUrl = normalizeServerUrl(url)
  }

  async init(): Promise<Result<void>> {
    if (!this.baseUrl) return err('No server address configured', 'NO_SERVER')

    try {
      const stored = await Preferences.get({ key: TOKEN_KEY })
      if (stored.value) this.token = stored.value
    } catch {
      // Preferences is unavailable in some browser contexts; sign-in still works.
    }

    const health = await this.request<{ status: string }>('GET', '/api/health', undefined, {
      skipAuth: true,
    })
    if (!health.ok) {
      return err(
        `Cannot reach the server at ${this.baseUrl}. Check the address and that both devices are on the same network.`,
        'UNREACHABLE'
      )
    }

    if (this.token) {
      const me = await this.request<{ user: SessionUser }>('GET', '/api/auth/me')
      if (me.ok) this.user = me.data.user
      else await this.clearToken()
    }

    return ok(undefined)
  }

  private async clearToken() {
    this.token = null
    this.user = null
    try {
      await Preferences.remove({ key: TOKEN_KEY })
    } catch {
      /* ignore */
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    opts: { skipAuth?: boolean } = {}
  ): Promise<Result<T>> {
    if (!this.baseUrl) return err('No server address configured', 'NO_SERVER')

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const headers: Record<string, string> = { Accept: 'application/json' }
      if (body !== undefined) headers['Content-Type'] = 'application/json'
      if (!opts.skipAuth && this.token) headers.Authorization = `Bearer ${this.token}`

      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      })

      if (res.status === 401) {
        await this.clearToken()
        return err('Your session has expired. Please sign in again.', 'UNAUTHORIZED')
      }

      const text = await res.text()
      let payload: unknown = null
      if (text) {
        try {
          payload = JSON.parse(text)
        } catch {
          return err('The server returned an unreadable response', 'BAD_RESPONSE')
        }
      }

      if (!res.ok) {
        const record = payload as { error?: string; code?: string } | null
        return err(record?.error ?? `Request failed (${res.status})`, record?.code)
      }

      return ok(payload as T)
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        return err('The server took too long to respond', 'TIMEOUT')
      }
      return err(
        `Could not reach the server. Check that it is running and on the same network.`,
        'NETWORK'
      )
    } finally {
      clearTimeout(timer)
    }
  }

  async getCurrentUser(): Promise<SessionUser | null> {
    return this.user
  }

  async login(username: string, password: string): Promise<Result<SessionUser>> {
    const res = await this.request<{ token: string; user: SessionUser }>(
      'POST',
      '/api/auth/login',
      { username, password },
      { skipAuth: true }
    )
    if (!res.ok) return err(res.error, res.code)

    this.token = res.data.token
    this.user = res.data.user
    try {
      await Preferences.set({ key: TOKEN_KEY, value: res.data.token })
    } catch {
      /* session still valid for this run */
    }
    return ok(res.data.user)
  }

  async logout(): Promise<void> {
    await this.clearToken()
  }

  async getDashboard(): Promise<Result<DashboardData>> {
    return this.request<DashboardData>('GET', '/api/dashboard')
  }

  async listProducts(): Promise<Result<ProductWithBatches[]>> {
    return this.request<ProductWithBatches[]>('GET', '/api/products')
  }

  async getProduct(gtin: string): Promise<Result<ProductWithBatches | null>> {
    return this.request<ProductWithBatches | null>(
      'GET',
      `/api/products/${encodeURIComponent(gtin)}`
    )
  }

  async createProduct(input: NewProductInput): Promise<Result<Product>> {
    return this.request<Product>('POST', '/api/products', input)
  }

  async updateProduct(id: string, input: Partial<NewProductInput>): Promise<Result<Product>> {
    return this.request<Product>('PATCH', `/api/products/${encodeURIComponent(id)}`, input)
  }

  async deleteProduct(id: string): Promise<Result<void>> {
    return this.request<void>('DELETE', `/api/products/${encodeURIComponent(id)}`)
  }

  async addBatch(input: NewBatchInput): Promise<Result<InventoryBatch>> {
    return this.request<InventoryBatch>('POST', '/api/batches', input)
  }

  async logUsage(batchId: string, quantity: number): Promise<Result<InventoryBatch>> {
    return this.request<InventoryBatch>('POST', '/api/usage', { batchId, quantity })
  }

  async deleteBatch(id: string): Promise<Result<void>> {
    return this.request<void>('DELETE', `/api/batches/${encodeURIComponent(id)}`)
  }

  async recentUsage(limit = 50): Promise<Result<UsageLogEntry[]>> {
    return this.request<UsageLogEntry[]>('GET', `/api/usage?limit=${limit}`)
  }
}
