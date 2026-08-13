import { addBatch } from '@/lib/server/inventory-service'
import { apiError, preflight, readJson, respond, toInt, withAuth } from '@/lib/server/api'
import type { NewBatchInput } from '@/core/types'

export const dynamic = 'force-dynamic'

export const POST = withAuth(async (request) => {
  const body = await readJson<Record<string, unknown>>(request)
  if (!body) return apiError('A JSON body is required', 400, 'VALIDATION')

  const input: NewBatchInput = {
    gtin: String(body.gtin ?? '').trim(),
    batchNumber: String(body.batchNumber ?? '').trim(),
    expirationDate: String(body.expirationDate ?? '').trim(),
    quantity: toInt(body.quantity, 0),
    producer: typeof body.producer === 'string' ? body.producer : null,
    notes: typeof body.notes === 'string' ? body.notes : null,
  }

  return respond(await addBatch(input))
})

export const OPTIONS = preflight
