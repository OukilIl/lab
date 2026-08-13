import { logUsage, recentUsage } from '@/lib/server/inventory-service'
import { apiError, preflight, readJson, respond, toInt, withAuth } from '@/lib/server/api'

export const dynamic = 'force-dynamic'

export const GET = withAuth(async (request) => {
  const limit = toInt(new URL(request.url).searchParams.get('limit'), 50)
  return respond(await recentUsage(limit))
})

export const POST = withAuth(async (request, session) => {
  const body = await readJson<Record<string, unknown>>(request)
  if (!body) return apiError('A JSON body is required', 400, 'VALIDATION')

  const batchId = String(body.batchId ?? '').trim()
  const quantity = toInt(body.quantity, 0)

  if (!batchId) return apiError('A batch id is required', 400, 'VALIDATION')

  // Usage is attributed to the authenticated caller, never to a client-supplied id.
  return respond(await logUsage(batchId, quantity, session.id))
})

export const OPTIONS = preflight
