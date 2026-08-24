/**
 * CSV and PDF export.
 *
 * Both build from the already-filtered rows, so what you export is exactly
 * what you were looking at. Pure string/byte generation with no browser or
 * Node APIs, so it runs identically on device, on the server and in tests.
 */

import { daysUntil, totalUnits } from './inventory.ts'
import type { ProductWithBatches } from './types.ts'

export interface ExportOptions {
  /** Stamped in the header; passed in so the output is deterministic. */
  generatedAt: Date
  title?: string
  /** Human-readable summary of the filters that produced these rows. */
  filterSummary?: string
}

// ── CSV ─────────────────────────────────────────────────────────────

/**
 * Escape one CSV field per RFC 4180.
 *
 * A leading =, +, - or @ is prefixed with a single quote: spreadsheet apps
 * would otherwise treat the value as a formula, which is both wrong for a lot
 * number and a genuine injection vector when the file is opened elsewhere.
 */
function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  let text = String(value)

  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`
  return text
}

const CSV_COLUMNS = [
  'Product',
  'GTIN',
  'Brand',
  'Supplier',
  'Storage',
  'Lot',
  'Expiry',
  'Days to expiry',
  'Quantity',
  'Initial quantity',
  'Product total',
  'Target stock',
  'Stock status',
  'Notes',
] as const

function stockStatusLabel(product: ProductWithBatches): string {
  const total = totalUnits(product.batches)
  if (total <= 0) return 'Out of stock'
  if (total <= product.targetStock * (product.lowStockThresholdPct / 100)) return 'Low'
  return 'OK'
}

/**
 * One row per batch, because that is the unit people act on. Products with no
 * batches still get a row so an empty product is visible in the export.
 */
export function toCsv(products: ProductWithBatches[], options: ExportOptions): string {
  const lines: string[] = [CSV_COLUMNS.join(',')]

  for (const product of products) {
    const total = totalUnits(product.batches)
    const status = stockStatusLabel(product)
    const common = [
      product.name,
      product.gtin,
      product.brand ?? '',
      product.supplier ?? '',
      product.storageTemp ?? '',
    ]

    if (product.batches.length === 0) {
      lines.push(
        [...common, '', '', '', 0, '', total, product.targetStock, status, '']
          .map(csvField)
          .join(',')
      )
      continue
    }

    for (const batch of product.batches) {
      const days = daysUntil(batch.expirationDate, options.generatedAt)
      lines.push(
        [
          ...common,
          batch.batchNumber,
          batch.expirationDate,
          Number.isNaN(days) ? '' : days,
          batch.currentQuantity,
          batch.initialQuantity,
          total,
          product.targetStock,
          status,
          batch.notes ?? '',
        ]
          .map(csvField)
          .join(',')
      )
    }
  }

  // CRLF per RFC 4180, and a BOM so Excel reads UTF-8 (µL, é, العربية).
  return '﻿' + lines.join('\r\n') + '\r\n'
}

// ── PDF ─────────────────────────────────────────────────────────────

/**
 * Minimal PDF writer.
 *
 * A dependency-free generator rather than a library: the mobile bundle ships
 * to a device, and a full PDF toolkit is megabytes for what is a plain
 * paginated table. Uses the built-in Helvetica fonts, so no font embedding.
 */

const PAGE_W = 595.28 // A4 at 72dpi
const PAGE_H = 841.89
const MARGIN = 40
const LINE = 14

/** Escape a string for a PDF literal, and drop anything non-Latin-1. */
function pdfText(value: string): string {
  return value
    .replace(/[\\()]/g, (c) => `\\${c}`)
    // WinAnsi cannot represent every script; a placeholder beats corruption.
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?')
}

interface Column {
  label: string
  width: number
  value: (p: ProductWithBatches, b: ProductWithBatches['batches'][number] | null) => string
}

/** Placeholder for an absent value; ASCII so it survives WinAnsi encoding. */
const NONE = '-'

const PDF_COLUMNS: Column[] = [
  { label: 'Product', width: 150, value: (p) => p.name },
  { label: 'Supplier', width: 85, value: (p) => p.supplier ?? NONE },
  { label: 'Lot', width: 80, value: (_p, b) => b?.batchNumber ?? NONE },
  { label: 'Expiry', width: 70, value: (_p, b) => b?.expirationDate ?? NONE },
  { label: 'Qty', width: 40, value: (_p, b) => (b ? String(b.currentQuantity) : '0') },
  {
    label: 'Total',
    width: 55,
    value: (p) => `${totalUnits(p.batches)}/${p.targetStock}`,
  },
]

function truncate(text: string, width: number, fontSize: number): string {
  // Helvetica averages ~0.5em per character; good enough to avoid overlap.
  const max = Math.floor(width / (fontSize * 0.5))
  return text.length > max ? text.slice(0, Math.max(1, max - 3)) + '...' : text
}

export function toPdf(products: ProductWithBatches[], options: ExportOptions): Uint8Array {
  const title = options.title ?? 'LabStock inventory'
  const stamp = options.generatedAt.toISOString().slice(0, 16).replace('T', ' ')

  const pages: string[] = []
  let content = ''
  let y = PAGE_H - MARGIN

  const startPage = () => {
    content = ''
    y = PAGE_H - MARGIN

    content += `BT /F2 16 Tf ${MARGIN} ${y} Td (${pdfText(title)}) Tj ET\n`
    y -= 20
    content += `BT /F1 9 Tf ${MARGIN} ${y} Td (${pdfText(`Generated ${stamp}`)}) Tj ET\n`
    y -= 12

    if (options.filterSummary) {
      content += `BT /F1 9 Tf ${MARGIN} ${y} Td (${pdfText(options.filterSummary)}) Tj ET\n`
      y -= 12
    }
    y -= 8

    let x = MARGIN
    for (const col of PDF_COLUMNS) {
      content += `BT /F2 9 Tf ${x} ${y} Td (${pdfText(col.label)}) Tj ET\n`
      x += col.width
    }
    y -= 4
    content += `${MARGIN} ${y} m ${PAGE_W - MARGIN} ${y} l S\n`
    y -= LINE
  }

  const rowFor = (p: ProductWithBatches, b: ProductWithBatches['batches'][number] | null) => {
    if (y < MARGIN + LINE * 2) {
      pages.push(content)
      startPage()
    }
    let x = MARGIN
    for (const col of PDF_COLUMNS) {
      content += `BT /F1 9 Tf ${x} ${y} Td (${pdfText(truncate(col.value(p, b), col.width, 9))}) Tj ET\n`
      x += col.width
    }
    y -= LINE
  }

  startPage()

  if (products.length === 0) {
    content += `BT /F1 10 Tf ${MARGIN} ${y} Td (No products match the current filters.) Tj ET\n`
  }

  for (const product of products) {
    const live = product.batches.filter((b) => b.currentQuantity > 0)
    if (live.length === 0) rowFor(product, null)
    else for (const batch of live) rowFor(product, batch)
  }
  pages.push(content)

  return assemblePdf(pages)
}

/** Build the PDF file structure around already-rendered page content. */
function assemblePdf(pages: string[]): Uint8Array {
  const objects: string[] = []
  const pageCount = pages.length

  // 1 = catalog, 2 = page tree, 3/4 = fonts, then per page: page + content.
  const pageObjectIds = pages.map((_, i) => 5 + i * 2)

  objects.push('<< /Type /Catalog /Pages 2 0 R >>')
  objects.push(
    `<< /Type /Pages /Count ${pageCount} /Kids [${pageObjectIds
      .map((id) => `${id} 0 R`)
      .join(' ')}] >>`
  )
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')

  pages.forEach((body, i) => {
    const contentId = pageObjectIds[i] + 1
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`
    )
    objects.push(`<< /Length ${body.length} >>\nstream\n${body}endstream`)
  })

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((obj, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`
  })

  const xrefOffset = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  }
  pdf +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`

  // Latin-1: the content streams are already restricted to that range.
  const bytes = new Uint8Array(pdf.length)
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff
  return bytes
}
