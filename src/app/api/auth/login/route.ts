import { compare } from 'bcryptjs'

import prisma from '@/lib/db'
import { signToken } from '@/lib/auth'
import { apiError, json, preflight, readJson } from '@/lib/server/api'

export const dynamic = 'force-dynamic'

interface LoginBody {
  username?: unknown
  password?: unknown
}

export async function POST(request: Request) {
  const body = await readJson<LoginBody>(request)
  const username = typeof body?.username === 'string' ? body.username.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''

  if (!username || !password) {
    return apiError('Username and password are required', 400, 'VALIDATION')
  }

  try {
    const user = await prisma.user.findUnique({ where: { username } })

    // Compare against a dummy hash when the user is absent so that the
    // response time does not reveal which usernames exist.
    const hash = user?.passwordHash ?? '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv'
    const valid = await compare(password, hash)

    if (!user || !valid) {
      return apiError('Invalid credentials', 401, 'INVALID_CREDENTIALS')
    }

    const token = await signToken({ id: user.id, username: user.username })
    return json({ token, user: { id: user.id, username: user.username } })
  } catch (e) {
    if (e instanceof Error && e.message.includes('JWT_SECRET')) {
      return apiError(e.message, 500, 'AUTH_MISCONFIGURED')
    }
    return apiError('Sign-in failed', 500)
  }
}

export const OPTIONS = preflight
