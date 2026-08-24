/**
 * Inventory filtering and sorting.
 *
 * Pure functions, so the same filter produces the same rows on device and on
 * the server — and so the export can be driven from exactly what the user is
 * looking at rather than re-querying with slightly different rules.
 */

import { daysUntil, totalUnits } from './inventory.ts'
import type { ProductWithBatches, StorageTemp } from './types.ts'

export type StockStatus = 'all' | 'low' | 'out' | 'ok'
export type ExpiryFilter = 'all' | 'expired' | 'expiring' | 'fresh'
export type SortKey = 'name' | 'stock' | 'expiry' | 'supplier'

export interface InventoryFilters {
  /** Matches name, GTIN, brand or supplier, case-insensitively. */
  search: string
  stock: StockStatus
  expiry: ExpiryFilter
  /** Empty means "any". */
  suppliers: string[]
  brands: string[]
  storageTemps: StorageTemp[]
  sort: SortKey
  sortDescending: boolean
}

export const DEFAULT_FILTERS: InventoryFilters = {
  search: '',
  stock: 'all',
  expiry: 'all',
  suppliers: [],
  brands: [],
  storageTemps: [],
  sort: 'name',
  sortDescending: false,
}

/** True when any filter would exclude rows (sorting alone does not count). */
export function hasActiveFilters(f: InventoryFilters): boolean {
  return (
    f.search.trim() !== '' ||
    f.stock !== 'all' ||
    f.expiry !== 'all' ||
    f.suppliers.length > 0 ||
    f.brands.length > 0 ||
    f.storageTemps.length > 0
  )
}

export function countActiveFilters(f: InventoryFilters): number {
  let n = 0
  if (f.search.trim()) n++
  if (f.stock !== 'all') n++
  if (f.expiry !== 'all') n++
  if (f.suppliers.length > 0) n++
  if (f.brands.length > 0) n++
  if (f.storageTemps.length > 0) n++
  return n
}

/** The soonest expiry among batches that still hold stock, or null. */
export function soonestExpiry(product: ProductWithBatches): string | null {
  const dates = product.batches
    .filter((b) => b.currentQuantity > 0)
    .map((b) => b.expirationDate)
    .sort()
  return dates[0] ?? null
}

function matchesSearch(product: ProductWithBatches, term: string): boolean {
  const q = term.trim().toLowerCase()
  if (!q) return true
  return (
    product.name.toLowerCase().includes(q) ||
    product.gtin.toLowerCase().includes(q) ||
    (product.brand ?? '').toLowerCase().includes(q) ||
    (product.supplier ?? '').toLowerCase().includes(q) ||
    // Lot numbers are how people actually look things up on a shelf.
    product.batches.some((b) => b.batchNumber.toLowerCase().includes(q))
  )
}

function matchesStock(product: ProductWithBatches, status: StockStatus): boolean {
  if (status === 'all') return true
  const total = totalUnits(product.batches)
  const threshold = product.targetStock * (product.lowStockThresholdPct / 100)

  if (status === 'out') return total <= 0
  if (status === 'low') return total > 0 && total <= threshold
  return total > threshold
}

function matchesExpiry(
  product: ProductWithBatches,
  filter: ExpiryFilter,
  now: Date
): boolean {
  if (filter === 'all') return true

  const live = product.batches.filter((b) => b.currentQuantity > 0)
  if (live.length === 0) return false

  const days = live.map((b) => daysUntil(b.expirationDate, now)).filter((d) => !Number.isNaN(d))
  if (days.length === 0) return false

  const soonest = Math.min(...days)
  if (filter === 'expired') return soonest < 0
  if (filter === 'expiring') return soonest >= 0 && soonest <= product.expirationWarningDays
  return soonest > product.expirationWarningDays
}

export function filterProducts(
  products: ProductWithBatches[],
  filters: InventoryFilters,
  now: Date = new Date()
): ProductWithBatches[] {
  const rows = products.filter(
    (p) =>
      matchesSearch(p, filters.search) &&
      matchesStock(p, filters.stock) &&
      matchesExpiry(p, filters.expiry, now) &&
      (filters.suppliers.length === 0 || filters.suppliers.includes(p.supplier ?? '')) &&
      (filters.brands.length === 0 || filters.brands.includes(p.brand ?? '')) &&
      (filters.storageTemps.length === 0 ||
        (p.storageTemp != null && filters.storageTemps.includes(p.storageTemp)))
  )

  const direction = filters.sortDescending ? -1 : 1
  return rows.sort((a, b) => {
    switch (filters.sort) {
      case 'stock':
        return (totalUnits(a.batches) - totalUnits(b.batches)) * direction
      case 'expiry': {
        // Products with no dated stock sort last regardless of direction:
        // "no expiry" is not an urgency, so it should never top the list.
        const ax = soonestExpiry(a)
        const bx = soonestExpiry(b)
        if (!ax && !bx) return 0
        if (!ax) return 1
        if (!bx) return -1
        return ax.localeCompare(bx) * direction
      }
      case 'supplier':
        return (a.supplier ?? '').localeCompare(b.supplier ?? '') * direction
      default:
        return a.name.localeCompare(b.name) * direction
    }
  })
}

/** Distinct non-empty values, sorted, for building filter menus. */
export function distinctValues(
  products: ProductWithBatches[],
  key: 'supplier' | 'brand'
): string[] {
  const seen = new Set<string>()
  for (const p of products) {
    const value = p[key]
    if (value) seen.add(value)
  }
  return [...seen].sort((a, b) => a.localeCompare(b))
}
