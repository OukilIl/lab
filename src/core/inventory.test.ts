import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDashboard,
  daysUntil,
  expiryStatus,
  formatDaysToExpiry,
  groupBatches,
  isValidIsoDate,
  pickBatchForConsumption,
  validateBatch,
  validateProduct,
} from './inventory.ts'
import type { InventoryBatch, ProductWithBatches } from './types.ts'

const NOW = new Date('2026-08-06T12:00:00Z')

function batch(over: Partial<InventoryBatch> = {}): InventoryBatch {
  return {
    id: 'b1',
    gtin: '03453120000011',
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
    gtin: '03453120000011',
    name: 'Test Reagent',
    targetStock: 100,
    lowStockThresholdPct: 20,
    expirationWarningDays: 30,
    batches: [],
    ...over,
  }
}

test('daysUntil is calendar-accurate and ignores time of day', () => {
  assert.equal(daysUntil('2026-08-06', NOW), 0)
  assert.equal(daysUntil('2026-08-07', NOW), 1)
  assert.equal(daysUntil('2026-08-05', NOW), -1)
  assert.equal(daysUntil('2026-09-05', NOW), 30)
})

test('daysUntil is stable across a late-evening local time', () => {
  // Guards against the drift the old Date.now() subtraction produced.
  const evening = new Date('2026-08-06T23:59:00Z')
  assert.equal(daysUntil('2026-08-07', evening), 1)
})

test('expiryStatus tiers', () => {
  assert.equal(expiryStatus(-1, 30), 'expired')
  assert.equal(expiryStatus(0, 30), 'critical')
  assert.equal(expiryStatus(7, 30), 'critical')
  assert.equal(expiryStatus(20, 30), 'warning')
  assert.equal(expiryStatus(60, 30), 'ok')
})

test('isValidIsoDate rejects impossible calendar dates', () => {
  assert.equal(isValidIsoDate('2026-02-29'), false) // not a leap year
  assert.equal(isValidIsoDate('2028-02-29'), true)
  assert.equal(isValidIsoDate('2026-13-01'), false)
  assert.equal(isValidIsoDate('2026-1-1'), false)
  assert.equal(isValidIsoDate('garbage'), false)
})

test('validateProduct catches out-of-range settings', () => {
  const base = {
    gtin: '03453120000011',
    name: 'X',
    targetStock: 100,
    lowStockThresholdPct: 20,
    expirationWarningDays: 30,
  }
  assert.equal(validateProduct(base), null)
  assert.match(validateProduct({ ...base, gtin: '' })!, /required/)
  assert.match(validateProduct({ ...base, name: '  ' })!, /required/)
  assert.match(validateProduct({ ...base, targetStock: 0 })!, /at least 1/)
  assert.match(validateProduct({ ...base, lowStockThresholdPct: 150 })!, /between 1 and 100/)
  assert.match(validateProduct({ ...base, expirationWarningDays: 0 })!, /between 1 and 3650/)
  assert.match(validateProduct({ ...base, targetStock: 1.5 })!, /whole number/)
})

test('validateBatch rejects bad dates and quantities', () => {
  const base = {
    gtin: '03453120000011',
    batchNumber: 'LOT1',
    expirationDate: '2026-12-01',
    quantity: 5,
  }
  assert.equal(validateBatch(base), null)
  assert.match(validateBatch({ ...base, expirationDate: '2026-02-30' })!, /valid expiration/)
  assert.match(validateBatch({ ...base, quantity: 0 })!, /at least 1/)
  assert.match(validateBatch({ ...base, quantity: 2.5 })!, /whole number/)
  assert.match(validateBatch({ ...base, batchNumber: '' })!, /required/)
})

test('dashboard totals across products and batches', () => {
  const data = buildDashboard(
    [
      product({ batches: [batch({ currentQuantity: 40 }), batch({ id: 'b2', currentQuantity: 10 })] }),
    ],
    NOW
  )
  assert.equal(data.totalUnits, 50)
  assert.equal(data.batchCount, 2)
  assert.equal(data.productCount, 1)
})

test('dashboard flags low stock at or below the threshold', () => {
  // 20 units against a target of 100 at 20% is exactly at the boundary.
  const data = buildDashboard([product({ batches: [batch({ currentQuantity: 20 })] })], NOW)
  assert.equal(data.lowStock.length, 1)
  assert.equal(data.lowStock[0].percentage, 20)

  const healthy = buildDashboard([product({ batches: [batch({ currentQuantity: 21 })] })], NOW)
  assert.equal(healthy.lowStock.length, 0)
})

test('dashboard ignores empty batches when computing expiry warnings', () => {
  const data = buildDashboard(
    [product({ batches: [batch({ currentQuantity: 0, expirationDate: '2020-01-01' })] })],
    NOW
  )
  assert.equal(data.expiringSoon.length, 0)
  assert.equal(data.expiredCount, 0)
})

test('dashboard sorts warnings most-urgent first', () => {
  const data = buildDashboard(
    [
      product({
        batches: [
          batch({ id: 'far', expirationDate: '2026-08-30' }),
          batch({ id: 'past', expirationDate: '2026-08-01' }),
          batch({ id: 'near', expirationDate: '2026-08-10' }),
        ],
      }),
    ],
    NOW
  )
  assert.deepEqual(
    data.expiringSoon.map((w) => w.batch.id),
    ['past', 'near', 'far']
  )
  assert.equal(data.expiredCount, 1)
})

test('FEFO picks the soonest-expiring batch with enough stock', () => {
  const chosen = pickBatchForConsumption(
    [
      batch({ id: 'late', expirationDate: '2026-12-01', currentQuantity: 50 }),
      batch({ id: 'early', expirationDate: '2026-09-01', currentQuantity: 50 }),
    ],
    10,
    NOW
  )
  assert.equal(chosen?.id, 'early')
})

test('FEFO skips batches without enough stock and expired ones', () => {
  const chosen = pickBatchForConsumption(
    [
      batch({ id: 'expired', expirationDate: '2026-01-01', currentQuantity: 50 }),
      batch({ id: 'thin', expirationDate: '2026-09-01', currentQuantity: 2 }),
      batch({ id: 'good', expirationDate: '2026-10-01', currentQuantity: 50 }),
    ],
    10,
    NOW
  )
  assert.equal(chosen?.id, 'good')
  assert.equal(pickBatchForConsumption([batch({ currentQuantity: 1 })], 999, NOW), null)
})

test('formatDaysToExpiry reads naturally', () => {
  assert.equal(formatDaysToExpiry(0), 'Expires today')
  assert.equal(formatDaysToExpiry(1), 'Expires tomorrow')
  assert.equal(formatDaysToExpiry(-1), 'Expired yesterday')
  assert.equal(formatDaysToExpiry(-5), 'Expired 5d ago')
  assert.equal(formatDaysToExpiry(12), '12d left')
})

test('groupBatches attaches batches to the right product, sorted by expiry', () => {
  const grouped = groupBatches(
    [product({ gtin: 'A' }), product({ id: 'p2', gtin: 'B' })],
    [
      batch({ id: 'b1', gtin: 'A', expirationDate: '2026-12-01' }),
      batch({ id: 'b2', gtin: 'A', expirationDate: '2026-09-01' }),
      batch({ id: 'b3', gtin: 'B', expirationDate: '2026-10-01' }),
    ]
  )
  assert.deepEqual(grouped[0].batches.map((b) => b.id), ['b2', 'b1'])
  assert.deepEqual(grouped[1].batches.map((b) => b.id), ['b3'])
})
