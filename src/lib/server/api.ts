/**
 * Route-handler helpers: uniform auth, CORS and error shape.
 *
 * The mobile app is served from `capacitor://localhost` (iOS) or
 * `http://localhost` (Android), so every API call is cross-origin. CORS is
 * permissive by design here because the server is intended for a trusted LAN
 * and authorisation is enforced by bearer token on every request, not by
 * origin.
 */

import { NextResponse } from 'next/server'
import { authenticate, type SessionPayload } from '@/lib/auth'
import type { Result } from '@/core/types'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
}

export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: CORS_HEADERS })
}

export function apiError(message: string, status = 400, code?: string): NextResponse {
  return json({ error: message, ...(code ? { code } : {}) }, status)
}

/** Preflight handler; re-exported as OPTIONS by each route. */
export function preflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

/** Map a domain Result onto an HTTP response. */
export function respond<T>(result: Result<T>): NextResponse {
  if (result.ok) {
    // `null` is a meaningful value — getProduct returns it for "no such
    // product" — so only `undefined` (a void result) becomes {success:true}.
    // Coalescing null too made every missing-product lookup look like a hit.
    return json(result.data === undefined ? { success: true } : result.data)
  }

  const status =
    result.code === 'NOT_FOUND' || result.code === 'PRODUCT_NOT_FOUND'
      ? 404
      : result.code === 'DUPLICATE'
        ? 409
        : result.code === 'VALIDATION' || result.code === 'INSUFFICIENT_STOCK'
          ? 400
          : // Write contention is transient, so tell the client to retry
            // rather than reporting a server fault.
            result.code === 'BUSY'
            ? 503
            : 500

  return apiError(result.error, status, result.code)
}

/**
 * Wrap a handler so it only runs for an authenticated caller.
 *
 * Authorisation lives here rather than in proxy/middleware: a network-edge
 * check can be bypassed, and it cannot run at all in a static export.
 */
export function withAuth(
  handler: (request: Request, session: SessionPayload) => Promise<NextResponse>
): (request: Request) => Promise<NextResponse> {
  return async (request: Request) => {
    let session: SessionPayload | null
    try {
      session = await authenticate(request)
    } catch (e) {
      // A missing JWT_SECRET throws; surface it as a server fault, not a 401.
      return apiError(
        e instanceof Error ? e.message : 'Authentication is misconfigured',
        500,
        'AUTH_MISCONFIGURED'
      )
    }

    if (!session) return apiError('Authentication required', 401, 'UNAUTHORIZED')

    try {
      return await handler(request, session)
    } catch (e) {
      console.error('API handler failed:', e)
      return apiError('Something went wrong on the server', 500)
    }
  }
}

/** Parse a JSON body, returning null when it is absent or malformed. */
export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    const text = await request.text()
    if (!text) return null
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

/** Coerce an unknown value to an integer within bounds. */
export function toInt(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}
