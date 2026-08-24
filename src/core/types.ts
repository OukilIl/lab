/**
 * Domain types shared by every backend.
 *
 * Dates cross the wire as ISO `YYYY-MM-DD` strings rather than `Date`
 * objects so that the local SQLite adapter and the HTTP adapter agree on a
 * single representation, and so JSON round-trips are lossless.
 */

/** Storage temperature requirement for a product. */
export type StorageTemp = 'ambient' | 'refrigerated' | 'frozen'

export const STORAGE_TEMPS: StorageTemp[] = ['ambient', 'refrigerated', 'frozen']

export function isStorageTemp(value: unknown): value is StorageTemp {
  return typeof value === 'string' && (STORAGE_TEMPS as string[]).includes(value)
}

export interface Product {
  id: string
  gtin: string
  name: string
  brand: string | null
  supplier: string | null
  storageTemp: StorageTemp | null
  targetStock: number
  lowStockThresholdPct: number
  expirationWarningDays: number
}

export interface InventoryBatch {
  id: string
  gtin: string
  batchNumber: string
  /** ISO `YYYY-MM-DD`. */
  expirationDate: string
  /** ISO timestamp. */
  addedDate: string
  initialQuantity: number
  currentQuantity: number
  producer: string | null
  notes: string | null
}

export interface UsageLogEntry {
  id: string
  userId: string | null
  userName: string | null
  inventoryBatchId: string
  quantityUsed: number
  /** ISO timestamp. */
  date: string
}

export interface ProductWithBatches extends Product {
  batches: InventoryBatch[]
}

export type ExpiryStatus = 'expired' | 'critical' | 'warning' | 'ok'

export interface ExpiryWarning {
  product: Product
  batch: InventoryBatch
  daysToExpiry: number
  status: ExpiryStatus
}

export interface LowStockAlert {
  product: Product
  current: number
  /** Percentage of target currently held, 0-100+. */
  percentage: number
}

export interface DashboardData {
  totalUnits: number
  productCount: number
  batchCount: number
  expiringSoon: ExpiryWarning[]
  lowStock: LowStockAlert[]
  expiredCount: number
}

export interface NewProductInput {
  gtin: string
  name: string
  brand?: string | null
  supplier?: string | null
  storageTemp?: StorageTemp | null
  targetStock: number
  lowStockThresholdPct: number
  expirationWarningDays: number
}

export interface NewBatchInput {
  gtin: string
  batchNumber: string
  expirationDate: string
  quantity: number
  producer?: string | null
  notes?: string | null
}

/** Discriminated result so callers handle failure explicitly. */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string; code?: string }

export function ok<T>(data: T): Result<T> {
  return { ok: true, data }
}

export function err<T = never>(error: string, code?: string): Result<T> {
  return { ok: false, error, code }
}
