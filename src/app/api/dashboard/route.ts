import { getDashboard } from '@/lib/server/inventory-service'
import { preflight, respond, withAuth } from '@/lib/server/api'

export const dynamic = 'force-dynamic'

export const GET = withAuth(async () => respond(await getDashboard()))

export const OPTIONS = preflight
