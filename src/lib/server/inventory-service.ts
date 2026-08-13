/**
 * Server-side inventory operations backed by Prisma.
 *
 * Mirrors the on-device backend so both modes behave identically. Shared
 * validation and dashboard maths come from `@/core`.
 */

import prisma from '@/lib/db'
import { buildDashboard, validateBatch, validateProduct } from '@/core/inventory'
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

/** Prisma returns Date objects; the wire format is an ISO date string. */
function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

type PrismaBatch = {
  id: string
  gtin: string
  batchNumber: string
  expirationDate: Date
  addedDate: Date
  initialQuantity: number
  currentQuantity: number
  producer: string | null
  notes: string | null
}

function serializeBatch(batch: PrismaBatch): InventoryBatch {
  return {
    id: batch.id,
    gtin: batch.gtin,
    batchNumber: batch.batchNumber,
    expirationDate: toIsoDate(batch.expirationDate),
    addedDate: batch.addedDate.toISOString(),
    initialQuantity: batch.initialQuantity,
    currentQuantity: batch.currentQuantity,
    producer: batch.producer,
    notes: batch.notes,
  }
}

export async function listProducts(): Promise<Result<ProductWithBatches[]>> {
  try {
    const products = await prisma.product.findMany({
      include: { inventoryBatches: { orderBy: { expirationDate: 'asc' } } },
      orderBy: { name: 'asc' },
    })

    return ok(
      products.map((p) => ({
        id: p.id,
        gtin: p.gtin,
        name: p.name,
        targetStock: p.targetStock,
        lowStockThresholdPct: p.lowStockThresholdPct,
        expirationWarningDays: p.expirationWarningDays,
        batches: p.inventoryBatches.map(serializeBatch),
      }))
    )
  } catch {
    return err('Could not read products')
  }
}

export async function getProduct(gtin: string): Promise<Result<ProductWithBatches | null>> {
  try {
    const p = await prisma.product.findUnique({
      where: { gtin },
      include: { inventoryBatches: { orderBy: { expirationDate: 'asc' } } },
    })
    if (!p) return ok(null)

    return ok({
      id: p.id,
      gtin: p.gtin,
      name: p.name,
      targetStock: p.targetStock,
      lowStockThresholdPct: p.lowStockThresholdPct,
      expirationWarningDays: p.expirationWarningDays,
      batches: p.inventoryBatches.map(serializeBatch),
    })
  } catch {
    return err('Could not read product')
  }
}

export async function getDashboard(): Promise<Result<DashboardData>> {
  const res = await listProducts()
  if (!res.ok) return res
  return ok(buildDashboard(res.data))
}

export async function createProduct(input: NewProductInput): Promise<Result<Product>> {
  const invalid = validateProduct(input)
  if (invalid) return err(invalid, 'VALIDATION')

  try {
    const created = await prisma.product.create({
      data: {
        gtin: input.gtin.trim(),
        name: input.name.trim(),
        targetStock: input.targetStock,
        lowStockThresholdPct: input.lowStockThresholdPct,
        expirationWarningDays: input.expirationWarningDays,
      },
    })
    return ok({
      id: created.id,
      gtin: created.gtin,
      name: created.name,
      targetStock: created.targetStock,
      lowStockThresholdPct: created.lowStockThresholdPct,
      expirationWarningDays: created.expirationWarningDays,
    })
  } catch (e) {
    if (typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002') {
      return err('A product with this GTIN already exists.', 'DUPLICATE')
    }
    return err('Could not create product')
  }
}

export async function updateProduct(
  id: string,
  input: Partial<NewProductInput>
): Promise<Result<Product>> {
  try {
    const existing = await prisma.product.findUnique({ where: { id } })
    if (!existing) return err('Product not found', 'NOT_FOUND')

    const merged = {
      gtin: existing.gtin,
      name: input.name ?? existing.name,
      targetStock: input.targetStock ?? existing.targetStock,
      lowStockThresholdPct: input.lowStockThresholdPct ?? existing.lowStockThresholdPct,
      expirationWarningDays: input.expirationWarningDays ?? existing.expirationWarningDays,
    }

    const invalid = validateProduct(merged)
    if (invalid) return err(invalid, 'VALIDATION')

    const updated = await prisma.product.update({
      where: { id },
      data: {
        name: merged.name.trim(),
        targetStock: merged.targetStock,
        lowStockThresholdPct: merged.lowStockThresholdPct,
        expirationWarningDays: merged.expirationWarningDays,
      },
    })

    return ok({
      id: updated.id,
      gtin: updated.gtin,
      name: updated.name,
      targetStock: updated.targetStock,
      lowStockThresholdPct: updated.lowStockThresholdPct,
      expirationWarningDays: updated.expirationWarningDays,
    })
  } catch {
    return err('Could not update product')
  }
}

export async function deleteProduct(id: string): Promise<Result<void>> {
  try {
    const product = await prisma.product.findUnique({ where: { id } })
    if (!product) return err('Product not found', 'NOT_FOUND')

    // Usage logs reference batches, so remove the tree bottom-up.
    await prisma.$transaction(async (tx) => {
      const batches = await tx.inventoryBatch.findMany({
        where: { gtin: product.gtin },
        select: { id: true },
      })
      const batchIds = batches.map((b) => b.id)
      if (batchIds.length > 0) {
        await tx.usageLog.deleteMany({ where: { inventoryBatchId: { in: batchIds } } })
        await tx.inventoryBatch.deleteMany({ where: { gtin: product.gtin } })
      }
      await tx.product.delete({ where: { id } })
    })

    return ok(undefined)
  } catch {
    return err('Could not delete product')
  }
}

export async function addBatch(input: NewBatchInput): Promise<Result<InventoryBatch>> {
  const invalid = validateBatch(input)
  if (invalid) return err(invalid, 'VALIDATION')

  try {
    const product = await prisma.product.findUnique({ where: { gtin: input.gtin } })
    if (!product) {
      return err(
        'No product is registered for this GTIN. Create the product first.',
        'PRODUCT_NOT_FOUND'
      )
    }

    const batchNumber = input.batchNumber.trim()
    const existing = await prisma.inventoryBatch.findUnique({
      where: { gtin_batchNumber: { gtin: input.gtin, batchNumber } },
    })

    if (existing) {
      // Restocking adds to the current count only. initialQuantity is the
      // historical baseline; rewriting it would make lifetime consumption
      // unrecoverable.
      const updated = await prisma.inventoryBatch.update({
        where: { id: existing.id },
        data: { currentQuantity: { increment: input.quantity } },
      })
      return ok(serializeBatch(updated))
    }

    const created = await prisma.inventoryBatch.create({
      data: {
        gtin: input.gtin,
        batchNumber,
        expirationDate: new Date(`${input.expirationDate}T00:00:00.000Z`),
        initialQuantity: input.quantity,
        currentQuantity: input.quantity,
        producer: input.producer?.trim() || null,
        notes: input.notes?.trim() || null,
      },
    })
    return ok(serializeBatch(created))
  } catch {
    return err('Could not add batch')
  }
}

/**
 * Transient contention, as opposed to a genuine failure.
 *
 * Covers SQLite's own busy/locked errors plus Prisma's P1008 (connection pool
 * timeout) and P2034 (write conflict), which are what a burst of simultaneous
 * scans actually produces. All are safe to retry: the transaction either
 * committed or did nothing.
 */
function isTransientLockError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  if (code === 'P1008' || code === 'P2034' || code === 'P1017') return true

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  return (
    message.includes('database is locked') ||
    message.includes('sqlite_busy') ||
    message.includes('database table is locked') ||
    message.includes('socket timeout') ||
    message.includes('timed out fetching a new connection') ||
    message.includes('transaction already closed')
  )
}

const MAX_LOCK_RETRIES = 8

export async function logUsage(
  batchId: string,
  quantity: number,
  userId: string
): Promise<Result<InventoryBatch>> {
  if (!Number.isInteger(quantity) || quantity < 1) {
    return err('Quantity must be a whole number of at least 1', 'VALIDATION')
  }

  // Several devices can scan the same batch simultaneously. SQLite serialises
  // writers, so a losing transaction must be retried rather than reported as
  // a failure — the operation is still valid, it just needs its turn.
  for (let attempt = 0; attempt < MAX_LOCK_RETRIES; attempt++) {
    try {
      // The stock check and the decrement must be a single atomic statement.
      // Reading first and then updating lets two concurrent requests both pass
      // the check and drive the quantity negative.
      const result = await prisma.$transaction(async (tx) => {
        const affected = await tx.inventoryBatch.updateMany({
          where: { id: batchId, currentQuantity: { gte: quantity } },
          data: { currentQuantity: { decrement: quantity } },
        })

        if (affected.count === 0) return null

        await tx.usageLog.create({
          data: { userId, inventoryBatchId: batchId, quantityUsed: quantity },
        })

        return tx.inventoryBatch.findUnique({ where: { id: batchId } })
      })

      if (!result) {
        const batch = await prisma.inventoryBatch.findUnique({ where: { id: batchId } })
        if (!batch) return err('Batch not found', 'NOT_FOUND')
        return err(
          `Only ${batch.currentQuantity} unit(s) remain in this batch.`,
          'INSUFFICIENT_STOCK'
        )
      }

      return ok(serializeBatch(result))
    } catch (error) {
      if (!isTransientLockError(error) || attempt === MAX_LOCK_RETRIES - 1) {
        if (isTransientLockError(error)) {
          return err(
            'The database is busy with another scan. Please try again.',
            'BUSY'
          )
        }
        console.error('logUsage failed:', error)
        return err('Could not record usage')
      }

      // Exponential backoff with jitter, so retrying clients do not sync up
      // and collide again on the next attempt.
      const delay = 25 * 2 ** attempt + Math.random() * 25
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  return err('Could not record usage')
}

export async function deleteBatch(id: string): Promise<Result<void>> {
  try {
    await prisma.$transaction([
      prisma.usageLog.deleteMany({ where: { inventoryBatchId: id } }),
      prisma.inventoryBatch.delete({ where: { id } }),
    ])
    return ok(undefined)
  } catch {
    return err('Could not delete batch')
  }
}

export async function recentUsage(limit = 50): Promise<Result<UsageLogEntry[]>> {
  try {
    const safeLimit = Math.min(Math.max(Math.trunc(limit) || 50, 1), 500)
    const logs = await prisma.usageLog.findMany({
      orderBy: { date: 'desc' },
      take: safeLimit,
      include: { user: { select: { username: true } } },
    })

    return ok(
      logs.map((log) => ({
        id: log.id,
        userId: log.userId,
        userName: log.user?.username ?? null,
        inventoryBatchId: log.inventoryBatchId,
        quantityUsed: log.quantityUsed,
        date: log.date.toISOString(),
      }))
    )
  } catch {
    return err('Could not read usage log')
  }
}
