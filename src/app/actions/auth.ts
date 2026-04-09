'use server'

import prisma from '@/lib/db'
import { createSession } from '@/lib/auth'
import { hash, compare } from 'bcryptjs'
import { redirect } from 'next/navigation'

export async function checkFirstSetup() {
  const users = await prisma.user.count()
  return users === 0
}

export async function setupApp(formData: FormData) {
  const username = formData.get('username') as string
  const password = formData.get('password') as string
  
  if (!username || !password) return { error: 'Missing fields' }

  const usersCount = await prisma.user.count()
  if (usersCount > 0) return { error: 'App is already setup.' }

  const passwordHash = await hash(password, 10)
  
  const user = await prisma.user.create({
    data: { username, passwordHash }
  })

  await createSession({ id: user.id, username: user.username })
  redirect('/')
}

export async function loginApp(formData: FormData) {
  const username = formData.get('username') as string
  const password = formData.get('password') as string
  
  if (!username || !password) return { error: 'Missing fields' }

  const user = await prisma.user.findUnique({ where: { username } })
  if (!user) return { error: 'Invalid credentials' }

  const valid = await compare(password, user.passwordHash)
  if (!valid) return { error: 'Invalid credentials' }

  await createSession({ id: user.id, username: user.username })
  redirect('/')
}
