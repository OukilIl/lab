import { hash } from 'bcryptjs'

import prisma from '@/lib/db'
import { signToken } from '@/lib/auth'
import { apiError, json, preflight, readJson } from '@/lib/server/api'

export const dynamic = 'force-dynamic'

const MIN_PASSWORD_LENGTH = 8

interface SetupBody {
  username?: unknown
  password?: unknown
}

/** Reports whether the server still needs its first account. */
export async function GET() {
  try {
    const count = await prisma.user.count()
    return json({ needsSetup: count === 0 })
  } catch {
    return apiError('Could not read server state', 500)
  }
}

/**
 * Create the first administrator. Only ever succeeds while no user exists,
 * so this endpoint cannot be used to add accounts later.
 */
export async function POST(request: Request) {
  const body = await readJson<SetupBody>(request)
  const username = typeof body?.username === 'string' ? body.username.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''

  if (!username || !password) {
    return apiError('Username and password are required', 400, 'VALIDATION')
  }
  if (username.length > 64) {
    return apiError('Username is too long (max 64 characters)', 400, 'VALIDATION')
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return apiError(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      400,
      'VALIDATION'
    )
  }

  try {
    const count = await prisma.user.count()
    if (count > 0) {
      return apiError('This server has already been set up', 409, 'ALREADY_SETUP')
    }

    const passwordHash = await hash(password, 12)
    const user = await prisma.user.create({ data: { username, passwordHash } })
    const token = await signToken({ id: user.id, username: user.username })

    return json({ token, user: { id: user.id, username: user.username } }, 201)
  } catch (e) {
    if (e instanceof Error && e.message.includes('JWT_SECRET')) {
      return apiError(e.message, 500, 'AUTH_MISCONFIGURED')
    }
    return apiError('Setup failed', 500)
  }
}

export const OPTIONS = preflight
