import { destroySession } from '@/lib/auth'
import { json, preflight } from '@/lib/server/api'

export const dynamic = 'force-dynamic'

/**
 * Clears the browser cookie. Token-based mobile clients discard their token
 * locally instead — there is no server-side token store to revoke.
 */
export async function POST() {
  await destroySession()
  return json({ success: true })
}

export const OPTIONS = preflight
