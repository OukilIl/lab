import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  const session = request.cookies.get('session')?.value
  const { pathname } = request.nextUrl
  
  // Public paths
  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth') || pathname.startsWith('/setup')) {
    return NextResponse.next()
  }

  // If missing session, redirect to login
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
