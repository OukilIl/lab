import { createProduct, listProducts } from '@/lib/server/inventory-service'
import { apiError, preflight, readJson, respond, toInt, withAuth } from '@/lib/server/api'
import { isStorageTemp } from '@/core/types'
import type { NewProductInput } from '@/core/types'

export const dynamic = 'force-dynamic'

export const GET = withAuth(async () => respond(await listProducts()))

export const POST = withAuth(async (request) => {
  const body = await readJson<Record<string, unknown>>(request)
  if (!body) return apiError('A JSON body is required', 400, 'VALIDATION')

  const input: NewProductInput = {
    gtin: String(body.gtin ?? '').trim(),
    name: String(body.name ?? '').trim(),
    brand: typeof body.brand === 'string' ? body.brand : null,
    supplier: typeof body.supplier === 'string' ? body.supplier : null,
    storageTemp: isStorageTemp(body.storageTemp) ? body.storageTemp : null,
    targetStock: toInt(body.targetStock, 100),
    lowStockThresholdPct: toInt(body.lowStockThresholdPct, 20),
    expirationWarningDays: toInt(body.expirationWarningDays, 30),
  }

  return respond(await createProduct(input))
})

export const OPTIONS = preflight
