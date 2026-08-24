import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_FILTERS,
  countActiveFilters,
  distinctValues,
  filterProducts,
  hasActiveFilters,
  soonestExpiry,
  type InventoryFilters,
} from './filters.ts'
import type { InventoryBatch, ProductWithBatches } from './types.ts'

const NOW = new Date('2026-08-06T12:00:00Z')

function batch(over: Partial<InventoryBatch> = {}): InventoryBatch {
  return {
    id: 'b1',
    gtin: 'G1',
    batchNumber: 'LOT1',
    expirationDate: '2026-12-01',
    addedDate: '2026-01-01T00:00:00.000Z',
    initialQuantity: 100,
    currentQuantity: 100,
    producer: null,
    notes: null,
    ...over,
  }
}

function product(over: Partial<ProductWithBatches> = {}): ProductWithBatches {
  return {
    id: 'p1',
    gtin: 'G1',
    name: 'Reagent A',
    brand: null,
    supplier: null,
    storageTemp: null,
    targetStock: 100,
    lowStockThresholdPct: 20,
    expirationWarningDays: 30,
    batches: [batch()],
    ...over,
  }
}

const f = (over: Partial<InventoryFilters> = {}): InventoryFilters => ({
  ...DEFAULT_FILTERS,
  ...over,
})

test('no filters returns everything', () => {
  const rows = [product(), product({ id: 'p2', gtin: 'G2', name: 'Reagent B' })]
  assert.equal(filterProducts(rows, f(), NOW).length, 2)
})

test('search matches name, GTIN, brand, supplier and lot', () => {
  const rows = [
    product({ id: 'p1', gtin: '111', name: 'Alpha', brand: 'Ansell', supplier: 'VWR' }),
    product({
      id: 'p2',
      gtin: '222',
      name: 'Beta',
      batches: [batch({ batchNumber: 'XYZ-9' })],
    }),
  ]
  const only = (search: string) => filterProducts(rows, f({ search }), NOW).map((p) => p.id)

  assert.deepEqual(only('alpha'), ['p1'])
  assert.deepEqual(only('111'), ['p1'])
  assert.deepEqual(only('ansell'), ['p1'], 'brand')
  assert.deepEqual(only('vwr'), ['p1'], 'supplier')
  assert.deepEqual(only('xyz-9'), ['p2'], 'lot number')
  assert.deepEqual(only('  ALPHA  '), ['p1'], 'trimmed and case-insensitive')
})

test('stock filter separates out, low and ok', () => {
  const rows = [
    product({ id: 'out', batches: [batch({ currentQuantity: 0 })] }),
    product({ id: 'low', batches: [batch({ currentQuantity: 20 })] }),
    product({ id: 'ok', batches: [batch({ currentQuantity: 80 })] }),
  ]
  const ids = (stock: InventoryFilters['stock']) =>
    filterProducts(rows, f({ stock }), NOW).map((p) => p.id)

  assert.deepEqual(ids('out'), ['out'])
  assert.deepEqual(ids('low'), ['low'], 'at the threshold counts as low')
  assert.deepEqual(ids('ok'), ['ok'])
})

test('expiry filter separates expired, expiring and fresh', () => {
  const rows = [
    product({ id: 'expired', batches: [batch({ expirationDate: '2026-07-01' })] }),
    product({ id: 'expiring', batches: [batch({ expirationDate: '2026-08-20' })] }),
    product({ id: 'fresh', batches: [batch({ expirationDate: '2027-01-01' })] }),
  ]
  const ids = (expiry: InventoryFilters['expiry']) =>
    filterProducts(rows, f({ expiry }), NOW).map((p) => p.id)

  assert.deepEqual(ids('expired'), ['expired'])
  assert.deepEqual(ids('expiring'), ['expiring'])
  assert.deepEqual(ids('fresh'), ['fresh'])
})

test('expiry filter ignores empty batches', () => {
  // An expired box with nothing in it is not an action item.
  const rows = [
    product({ id: 'empty', batches: [batch({ currentQuantity: 0, expirationDate: '2020-01-01' })] }),
  ]
  assert.deepEqual(filterProducts(rows, f({ expiry: 'expired' }), NOW), [])
})

test('supplier, brand and storage filters are OR within, AND across', () => {
  const rows = [
    product({ id: 'a', supplier: 'VWR', brand: 'Ansell', storageTemp: 'frozen' }),
    product({ id: 'b', supplier: 'Fisher', brand: 'Ansell', storageTemp: 'ambient' }),
    product({ id: 'c', supplier: 'VWR', brand: 'Kimtech', storageTemp: 'ambient' }),
  ]
  assert.deepEqual(
    filterProducts(rows, f({ suppliers: ['VWR'] }), NOW).map((p) => p.id),
    ['a', 'c']
  )
  assert.deepEqual(
    filterProducts(rows, f({ suppliers: ['VWR', 'Fisher'] }), NOW).map((p) => p.id),
    ['a', 'b', 'c'],
    'multiple values are OR'
  )
  assert.deepEqual(
    filterProducts(rows, f({ suppliers: ['VWR'], brands: ['Kimtech'] }), NOW).map((p) => p.id),
    ['c'],
    'different facets are AND'
  )
  assert.deepEqual(
    filterProducts(rows, f({ storageTemps: ['frozen'] }), NOW).map((p) => p.id),
    ['a']
  )
})

test('sorting by name, stock and supplier, both directions', () => {
  const rows = [
    product({ id: 'b', name: 'Beta', supplier: 'Zeta', batches: [batch({ currentQuantity: 5 })] }),
    product({ id: 'a', name: 'Alpha', supplier: 'Acme', batches: [batch({ currentQuantity: 50 })] }),
  ]
  assert.deepEqual(filterProducts(rows, f({ sort: 'name' }), NOW).map((p) => p.id), ['a', 'b'])
  assert.deepEqual(
    filterProducts(rows, f({ sort: 'name', sortDescending: true }), NOW).map((p) => p.id),
    ['b', 'a']
  )
  assert.deepEqual(filterProducts(rows, f({ sort: 'stock' }), NOW).map((p) => p.id), ['b', 'a'])
  assert.deepEqual(filterProducts(rows, f({ sort: 'supplier' }), NOW).map((p) => p.id), ['a', 'b'])
})

test('products with no dated stock always sort last by expiry', () => {
  const rows = [
    product({ id: 'none', batches: [] }),
    product({ id: 'dated', batches: [batch({ expirationDate: '2026-09-01' })] }),
  ]
  // "No expiry" is not an urgency, so it must not top the list either way.
  assert.deepEqual(filterProducts(rows, f({ sort: 'expiry' }), NOW).map((p) => p.id), [
    'dated',
    'none',
  ])
  assert.deepEqual(
    filterProducts(rows, f({ sort: 'expiry', sortDescending: true }), NOW).map((p) => p.id),
    ['dated', 'none']
  )
})

test('soonestExpiry ignores empty batches', () => {
  const p = product({
    batches: [
      batch({ id: 'empty', currentQuantity: 0, expirationDate: '2026-01-01' }),
      batch({ id: 'live', currentQuantity: 5, expirationDate: '2026-10-01' }),
    ],
  })
  assert.equal(soonestExpiry(p), '2026-10-01')
  assert.equal(soonestExpiry(product({ batches: [] })), null)
})

test('active filter detection and counting', () => {
  assert.equal(hasActiveFilters(f()), false)
  assert.equal(hasActiveFilters(f({ sort: 'stock', sortDescending: true })), false, 'sort is not a filter')
  assert.equal(hasActiveFilters(f({ search: 'x' })), true)
  assert.equal(hasActiveFilters(f({ search: '   ' })), false, 'whitespace is not a search')
  assert.equal(countActiveFilters(f({ search: 'x', stock: 'low', brands: ['A'] })), 3)
})

test('distinctValues returns sorted unique non-empty values', () => {
  const rows = [
    product({ id: 'a', supplier: 'VWR', brand: null }),
    product({ id: 'b', supplier: 'Acme' }),
    product({ id: 'c', supplier: 'VWR' }),
    product({ id: 'd', supplier: null }),
  ]
  assert.deepEqual(distinctValues(rows, 'supplier'), ['Acme', 'VWR'])
  assert.deepEqual(distinctValues(rows, 'brand'), [])
})
