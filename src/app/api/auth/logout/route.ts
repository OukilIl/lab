import { destroySession } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function POST() {
  await destroySession()
  return NextResponse.json({ success: true })
}
