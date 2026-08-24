import { authenticate } from '@/lib/auth'
import { apiError, preflight, readJson, respond, toInt } from '@/lib/server/api'
import { deleteProduct, getProduct, updateProduct } from '@/lib/server/inventory-service'
import { isStorageTemp } from '@/core/types'
import type { NewProductInput } from '@/core/types'

export const dynamic = 'force-dynamic'

/**
 * `[id]` accepts either a product id or a GTIN: GET is used by the scanner to
 * look up a scanned code, while PATCH/DELETE address the record by id.
 */
async function requireSession(request: Request) {
  try {
    return await authenticate(request)
  } catch {
    return null
  }
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireSession(request)
  if (!session) return apiError('Authentication required', 401, 'UNAUTHORIZED')

  const { id } = await ctx.params
  return respond(await getProduct(decodeURIComponent(id)))
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireSession(request)
  if (!session) return apiError('Authentication required', 401, 'UNAUTHORIZED')

  const { id } = await ctx.params
  const body = await readJson<Record<string, unknown>>(request)
  if (!body) return apiError('A JSON body is required', 400, 'VALIDATION')

  const patch: Partial<NewProductInput> = {}
  if (typeof body.name === 'string') patch.name = body.name.trim()
  // `null` clears the field; absent leaves it unchanged.
  if (body.brand !== undefined) patch.brand = typeof body.brand === 'string' ? body.brand : null
  if (body.supplier !== undefined) {
    patch.supplier = typeof body.supplier === 'string' ? body.supplier : null
  }
  if (body.storageTemp !== undefined) {
    patch.storageTemp = isStorageTemp(body.storageTemp) ? body.storageTemp : null
  }
  if (body.targetStock !== undefined) patch.targetStock = toInt(body.targetStock, 100)
  if (body.lowStockThresholdPct !== undefined) {
    patch.lowStockThresholdPct = toInt(body.lowStockThresholdPct, 20)
  }
  if (body.expirationWarningDays !== undefined) {
    patch.expirationWarningDays = toInt(body.expirationWarningDays, 30)
  }

  return respond(await updateProduct(decodeURIComponent(id), patch))
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireSession(request)
  if (!session) return apiError('Authentication required', 401, 'UNAUTHORIZED')

  const { id } = await ctx.params
  return respond(await deleteProduct(decodeURIComponent(id)))
}

export const OPTIONS = preflight
