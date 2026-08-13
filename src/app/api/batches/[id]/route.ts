import { authenticate } from '@/lib/auth'
import { apiError, preflight, respond } from '@/lib/server/api'
import { deleteBatch } from '@/lib/server/inventory-service'

export const dynamic = 'force-dynamic'

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  let session
  try {
    session = await authenticate(request)
  } catch {
    session = null
  }
  if (!session) return apiError('Authentication required', 401, 'UNAUTHORIZED')

  const { id } = await ctx.params
  return respond(await deleteBatch(decodeURIComponent(id)))
}

export const OPTIONS = preflight
