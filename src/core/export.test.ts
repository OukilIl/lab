import { test } from 'node:test'
import assert from 'node:assert/strict'

import { toCsv, toPdf } from './export.ts'
import type { InventoryBatch, ProductWithBatches } from './types.ts'

const AT = new Date('2026-08-06T12:00:00Z')

function batch(over: Partial<InventoryBatch> = {}): InventoryBatch {
  return {
    id: 'b1',
    gtin: 'G1',
    batchNumber: 'LOT1',
    expirationDate: '2026-12-01',
    addedDate: '2026-01-01T00:00:00.000Z',
    initialQuantity: 100,
    currentQuantity: 60,
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
    brand: 'Ansell',
    supplier: 'VWR',
    storageTemp: 'frozen',
    targetStock: 100,
    lowStockThresholdPct: 20,
    expirationWarningDays: 30,
    batches: [batch()],
    ...over,
  }
}

const lines = (csv: string) => csv.replace(/^﻿/, '').trim().split('\r\n')

test('CSV has a header and one row per batch', () => {
  const csv = toCsv(
    [product({ batches: [batch({ id: 'b1' }), batch({ id: 'b2', batchNumber: 'LOT2' })] })],
    { generatedAt: AT }
  )
  const rows = lines(csv)
  assert.equal(rows.length, 3, "header + 2 batches")
  // Product total is 120: both batches hold 60.
  assert.match(rows[0], /^Product,GTIN,Brand,Supplier,Storage,Lot,/)
  assert.match(rows[1], /^Reagent A,G1,Ansell,VWR,frozen,LOT1,2026-12-01,117,60,100,120,100,OK,$/)
})

test('CSV starts with a UTF-8 BOM and uses CRLF', () => {
  const csv = toCsv([product()], { generatedAt: AT })
  assert.ok(csv.startsWith('﻿'), 'BOM so Excel reads UTF-8')
  assert.ok(csv.includes('\r\n'), 'RFC 4180 line endings')
})

test('CSV quotes fields containing commas, quotes or newlines', () => {
  const csv = toCsv(
    [product({ name: 'Tips, sterile', batches: [batch({ notes: 'He said "cold"' })] })],
    { generatedAt: AT }
  )
  assert.ok(csv.includes('"Tips, sterile"'), 'comma forces quoting')
  assert.ok(csv.includes('"He said ""cold"""'), 'inner quotes are doubled')
})

test('CSV neutralises formula injection', () => {
  // A lot number starting with = would execute as a formula in Excel.
  const csv = toCsv(
    [product({ batches: [batch({ batchNumber: '=1+1' })] })],
    { generatedAt: AT }
  )
  assert.ok(csv.includes("'=1+1"), 'leading = is escaped with a quote')
  assert.ok(!/,=1\+1,/.test(csv), 'raw formula must not survive')

  for (const dangerous of ['+A1', '-2', '@SUM(A1)']) {
    const out = toCsv([product({ batches: [batch({ batchNumber: dangerous })] })], {
      generatedAt: AT,
    })
    assert.ok(out.includes(`'${dangerous}`), `${dangerous} is escaped`)
  }
})

test('CSV emits a row for a product with no batches', () => {
  const csv = toCsv([product({ batches: [] })], { generatedAt: AT })
  const rows = lines(csv)
  assert.equal(rows.length, 2, 'empty products stay visible')
  assert.match(rows[1], /Reagent A,G1,Ansell,VWR,frozen,,,,0,,0,100,Out of stock,/)
})

test('CSV reports stock status per product', () => {
  const status = (qty: number) =>
    lines(toCsv([product({ batches: [batch({ currentQuantity: qty })] })], { generatedAt: AT }))[1]
  assert.match(status(0), /Out of stock/)
  assert.match(status(20), /,Low,/)
  assert.match(status(90), /,OK,/)
})

test('CSV escapes empty and null metadata safely', () => {
  const csv = toCsv(
    [product({ brand: null, supplier: null, storageTemp: null })],
    { generatedAt: AT }
  )
  assert.match(lines(csv)[1], /^Reagent A,G1,,,,LOT1,/)
})

test('PDF has a valid header and trailer', () => {
  const bytes = toPdf([product()], { generatedAt: AT })
  const text = Buffer.from(bytes).toString('latin1')
  assert.ok(text.startsWith('%PDF-1.4'), 'PDF magic')
  assert.ok(text.trimEnd().endsWith('%%EOF'), 'EOF marker')
  assert.match(text, /\/Type \/Catalog/)
  assert.match(text, /\/Type \/Pages/)
  assert.match(text, /startxref/)
})

test('PDF xref offsets point at the objects they describe', () => {
  const text = Buffer.from(toPdf([product()], { generatedAt: AT })).toString('latin1')
  // Match the table itself, not the `startxref` pointer that follows it.
  const xrefIndex = text.indexOf('\nxref\n')
  assert.ok(xrefIndex > 0, 'xref table present')
  const entries = [...text.slice(xrefIndex).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) =>
    parseInt(m[1], 10)
  )
  assert.ok(entries.length >= 4, 'catalog, pages and two fonts at minimum')
  entries.forEach((offset, i) => {
    assert.match(text.slice(offset, offset + 20), new RegExp(`^${i + 1} 0 obj`), `object ${i + 1}`)
  })
})

test('PDF paginates a long inventory', () => {
  const many = Array.from({ length: 120 }, (_, i) =>
    product({ id: `p${i}`, gtin: `G${i}`, name: `Product ${i}` })
  )
  const text = Buffer.from(toPdf(many, { generatedAt: AT })).toString('latin1')
  const pageCount = [...text.matchAll(/\/Type \/Page[^s]/g)].length
  assert.ok(pageCount > 1, `expected multiple pages, got ${pageCount}`)
  assert.match(text, new RegExp(`/Count ${pageCount}`), 'page tree count matches')
})

test('PDF escapes characters that would break a literal string', () => {
  const text = Buffer.from(
    toPdf([product({ name: 'Tips (200µL) \\ "special"' })], { generatedAt: AT })
  ).toString('latin1')
  // Unescaped parentheses would terminate the string and corrupt the file.
  assert.ok(text.includes('\\(200'), 'open paren escaped')
  assert.ok(text.includes('L\\)'), 'close paren escaped')
})

test('PDF renders an empty result without crashing', () => {
  const text = Buffer.from(toPdf([], { generatedAt: AT })).toString('latin1')
  assert.ok(text.startsWith('%PDF-1.4'))
  assert.match(text, /No products match/)
})

test('PDF includes the filter summary when given', () => {
  const text = Buffer.from(
    toPdf([product()], { generatedAt: AT, filterSummary: 'Supplier: VWR' })
  ).toString('latin1')
  assert.match(text, /Supplier: VWR/)
})
