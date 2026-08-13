import { json, preflight, withAuth } from '@/lib/server/api'

export const dynamic = 'force-dynamic'

/** Validates a stored token on app start. */
export const GET = withAuth(async (_request, session) => {
  return json({ user: { id: session.id, username: session.username } })
})

export const OPTIONS = preflight
