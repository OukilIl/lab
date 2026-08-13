/**
 * Server-side authentication.
 *
 * Only used when the app runs as a LAN server. The mobile client authenticates
 * with a bearer token rather than a cookie, because a static Capacitor bundle
 * is a cross-origin caller and cookies are unreliable there.
 */

import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

export interface SessionPayload {
  id: string
  username: string
}

const MIN_SECRET_LENGTH = 32

/**
 * Resolve the signing secret.
 *
 * This used to fall back to a hardcoded literal, which meant every deployment
 * that forgot to set JWT_SECRET shared a publicly-known key and could have its
 * sessions forged. Refusing to start is the correct failure mode.
 */
function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET

  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET must be set to at least ${MIN_SECRET_LENGTH} characters before the server can start. ` +
        `Generate one with:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
    )
  }
  return new TextEncoder().encode(secret)
}

let cachedKey: Uint8Array | null = null
function key(): Uint8Array {
  if (!cachedKey) cachedKey = getSecretKey()
  return cachedKey
}

export async function signToken(payload: SessionPayload, expiresIn = '7d'): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key())
}

/** Verify a token; returns null for anything invalid, expired or malformed. */
export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] })
    if (typeof payload.id !== 'string' || typeof payload.username !== 'string') return null
    return { id: payload.id, username: payload.username }
  } catch {
    return null
  }
}

/** Read and verify the session from the request cookie (browser clients). */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies()
  const token = store.get('session')?.value
  if (!token) return null
  return verifyToken(token)
}

/** Extract and verify a bearer token from an Authorization header. */
export async function getSessionFromHeader(
  authorization: string | null
): Promise<SessionPayload | null> {
  if (!authorization) return null
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim())
  if (!match) return null
  return verifyToken(match[1])
}

/**
 * Authenticate a request from either transport.
 *
 * Always call this in a route handler before touching data — the network
 * boundary is not an authorisation boundary.
 */
export async function authenticate(request: Request): Promise<SessionPayload | null> {
  const bearer = await getSessionFromHeader(request.headers.get('authorization'))
  if (bearer) return bearer
  return getSession()
}

export async function createSession(user: SessionPayload): Promise<void> {
  const store = await cookies()
  const token = await signToken(user)
  store.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
}

export async function destroySession(): Promise<void> {
  const store = await cookies()
  store.delete('session')
}
