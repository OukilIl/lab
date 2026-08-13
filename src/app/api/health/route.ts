import { json, preflight } from '@/lib/server/api'

export const dynamic = 'force-dynamic'

/** Unauthenticated reachability probe used by the mobile app's setup screen. */
export async function GET() {
  return json({ status: 'ok', service: 'labstock', apiVersion: 1 })
}

export const OPTIONS = preflight
