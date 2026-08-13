/**
 * Inventory domain logic.
 *
 * Pure functions only — no I/O, no imports. Both the on-device SQLite
 * backend and the LAN server run this same code, so stock and expiry
 * calculations cannot drift between them.
 */

import type {
  DashboardData,
  ExpiryStatus,
  ExpiryWarning,
  InventoryBatch,
  LowStockAlert,
  NewBatchInput,
  NewProductInput,
  Product,
  ProductWithBatches,
} from './types.ts'

export const MS_PER_DAY = 86_400_000

/** Whole days from `now` until `isoDate`; negative once past. */
export function daysUntil(isoDate: string, now: Date = new Date()): number {
  const target = Date.parse(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(target)) return Number.NaN

  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.round((target - todayUtc) / MS_PER_DAY)
}

export function expiryStatus(daysToExpiry: number, warningDays: number): ExpiryStatus {
  if (daysToExpiry < 0) return 'expired'
  if (daysToExpiry <= Math.min(7, warningDays)) return 'critical'
  if (daysToExpiry <= warningDays) return 'warning'
  return 'ok'
}

/** ISO `YYYY-MM-DD`, structurally valid and a real calendar date. */
export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map((n) => parseInt(n, 10))
  if (m < 1 || m > 12) return false
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return d >= 1 && d <= daysInMonth
}

/**
 * A GTIN here is a user-facing identifier, so we accept 8-14 digits rather
 * than enforcing a check digit — some in-house lab labels are not real GS1
 * codes. The scanner surfaces check-digit warnings separately.
 */
export function normalizeGtin(raw: string): string {
  return raw.trim().replace(/\s+/g, '')
}

export function validateProduct(input: NewProductInput): string | null {
  const gtin = normalizeGtin(input.gtin)
  if (!gtin) return 'GTIN is required'
  if (!/^[0-9A-Za-z._-]{4,32}$/.test(gtin)) {
    return 'GTIN must be 4-32 characters (letters, digits, dot, dash or underscore)'
  }
  if (!input.name.trim()) return 'Product name is required'
  if (input.name.trim().length > 200) return 'Product name is too long (max 200)'

  if (!Number.isInteger(input.targetStock) || input.targetStock < 1) {
    return 'Target stock must be a whole number of at least 1'
  }
  if (input.targetStock > 1_000_000) return 'Target stock is unrealistically large'

  if (
    !Number.isInteger(input.lowStockThresholdPct) ||
    input.lowStockThresholdPct < 1 ||
    input.lowStockThresholdPct > 100
  ) {
    return 'Low-stock threshold must be between 1 and 100 percent'
  }
  if (
    !Number.isInteger(input.expirationWarningDays) ||
    input.expirationWarningDays < 1 ||
    input.expirationWarningDays > 3650
  ) {
    return 'Expiry warning must be between 1 and 3650 days'
  }
  return null
}

export function validateBatch(input: NewBatchInput): string | null {
  if (!normalizeGtin(input.gtin)) return 'GTIN is required'
  if (!input.batchNumber.trim()) return 'Batch number is required'
  if (input.batchNumber.trim().length > 64) return 'Batch number is too long (max 64)'
  if (!isValidIsoDate(input.expirationDate)) return 'A valid expiration date is required'
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    return 'Quantity must be a whole number of at least 1'
  }
  if (input.quantity > 1_000_000) return 'Quantity is unrealistically large'
  return null
}

export function totalUnits(batches: InventoryBatch[]): number {
  return batches.reduce((sum, b) => sum + b.currentQuantity, 0)
}

/**
 * Build the dashboard view model from raw products and batches.
 *
 * Batches with zero stock are ignored for expiry purposes — an empty
 * expired box is not an action item.
 */
export function buildDashboard(
  products: ProductWithBatches[],
  now: Date = new Date()
): DashboardData {
  const expiringSoon: ExpiryWarning[] = []
  const lowStock: LowStockAlert[] = []

  let total = 0
  let batchCount = 0
  let expiredCount = 0

  for (const product of products) {
    let productTotal = 0

    for (const batch of product.batches) {
      batchCount++
      productTotal += batch.currentQuantity
      total += batch.currentQuantity

      if (batch.currentQuantity <= 0) continue

      const days = daysUntil(batch.expirationDate, now)
      if (Number.isNaN(days)) continue

      if (days < 0) expiredCount++

      if (days <= product.expirationWarningDays) {
        expiringSoon.push({
          product,
          batch,
          daysToExpiry: days,
          status: expiryStatus(days, product.expirationWarningDays),
        })
      }
    }

    const threshold = product.targetStock * (product.lowStockThresholdPct / 100)
    if (productTotal <= threshold) {
      lowStock.push({
        product,
        current: productTotal,
        percentage:
          product.targetStock > 0
            ? Math.round((productTotal / product.targetStock) * 100)
            : 0,
      })
    }
  }

  // Most urgent first.
  expiringSoon.sort((a, b) => a.daysToExpiry - b.daysToExpiry)
  lowStock.sort((a, b) => a.percentage - b.percentage)

  return {
    totalUnits: total,
    productCount: products.length,
    batchCount,
    expiringSoon,
    lowStock,
    expiredCount,
  }
}

/**
 * Choose which batch to consume from: FEFO (first expired, first out),
 * the standard practice for perishable clinical stock.
 */
export function pickBatchForConsumption(
  batches: InventoryBatch[],
  quantity: number,
  now: Date = new Date()
): InventoryBatch | null {
  const usable = batches
    .filter((b) => b.currentQuantity >= quantity && daysUntil(b.expirationDate, now) >= 0)
    .sort((a, b) => a.expirationDate.localeCompare(b.expirationDate))

  return usable[0] ?? null
}

export function formatDaysToExpiry(days: number): string {
  if (days < 0) {
    const n = Math.abs(days)
    return n === 1 ? 'Expired yesterday' : `Expired ${n}d ago`
  }
  if (days === 0) return 'Expires today'
  if (days === 1) return 'Expires tomorrow'
  return `${days}d left`
}

/** Group flat batch rows under their product. */
export function groupBatches(
  products: Product[],
  batches: InventoryBatch[]
): ProductWithBatches[] {
  const byGtin = new Map<string, InventoryBatch[]>()
  for (const batch of batches) {
    const list = byGtin.get(batch.gtin)
    if (list) list.push(batch)
    else byGtin.set(batch.gtin, [batch])
  }

  return products.map((product) => ({
    ...product,
    batches: (byGtin.get(product.gtin) ?? []).sort((a, b) =>
      a.expirationDate.localeCompare(b.expirationDate)
    ),
  }))
}
