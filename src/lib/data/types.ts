/**
 * The storage contract.
 *
 * Two implementations satisfy it:
 *   - `local.ts`  — SQLite on the device (Capacitor) or IndexedDB-backed
 *                   fallback in a plain browser.
 *   - `remote.ts` — HTTP calls to a LabStock server on the LAN.
 *
 * The UI only ever talks to this interface, so switching modes at runtime
 * requires no component changes.
 */

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

export type BackendMode = 'local' | 'remote'

export interface SessionUser {
  id: string
  username: string
}

export interface DataBackend {
  readonly mode: BackendMode

  /** Prepare the backend (open the database, verify the server). */
  init(): Promise<Result<void>>

  /** Remote mode requires a login; local mode reports `null`. */
  getCurrentUser(): Promise<SessionUser | null>
  login(username: string, password: string): Promise<Result<SessionUser>>
  logout(): Promise<void>

  getDashboard(): Promise<Result<DashboardData>>
  listProducts(): Promise<Result<ProductWithBatches[]>>
  getProduct(gtin: string): Promise<Result<ProductWithBatches | null>>

  createProduct(input: NewProductInput): Promise<Result<Product>>
  updateProduct(id: string, input: Partial<NewProductInput>): Promise<Result<Product>>
  deleteProduct(id: string): Promise<Result<void>>

  addBatch(input: NewBatchInput): Promise<Result<InventoryBatch>>
  logUsage(batchId: string, quantity: number): Promise<Result<InventoryBatch>>
  deleteBatch(id: string): Promise<Result<void>>

  recentUsage(limit?: number): Promise<Result<UsageLogEntry[]>>
}

/** Persisted connection settings. */
export interface AppSettings {
  mode: BackendMode
  /** e.g. `http://192.168.1.89:3000` — remote mode only. */
  serverUrl: string
  /** Set once the user has chosen a mode, so onboarding is not shown again. */
  configured: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  mode: 'local',
  serverUrl: '',
  configured: false,
}

export const SETTINGS_KEY = 'labstock.settings'
