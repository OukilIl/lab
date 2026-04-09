import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const secretKey = 'super-secret-lab-key-that-needs-to-be-env-in-prod' // For simple distribution, we hardcode a fallback or read from env
const key = new TextEncoder().encode(process.env.JWT_SECRET || secretKey)

export async function encrypt(payload: any) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1w') // 1 week session
    .sign(key)
}

export async function decrypt(input: string): Promise<any> {
  const { payload } = await jwtVerify(input, key, {
    algorithms: ['HS256'],
  })
  return payload
}

export async function getSession() {
  const cookieStore = await cookies()
  const session = cookieStore.get('session')?.value
  if (!session) return null
  try {
    return await decrypt(session)
  } catch (e) {
    return null
  }
}

export async function createSession(user: { id: string, username: string }) {
  const cookieStore = await cookies()
  const val = await encrypt(user)
  cookieStore.set('session', val, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  })
}

export async function destroySession() {
  const cookieStore = await cookies()
  cookieStore.delete('session')
}
