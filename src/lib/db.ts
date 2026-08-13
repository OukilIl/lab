import { PrismaClient } from '@prisma/client'

/**
 * Prisma client singleton.
 *
 * SQLite serialises writers, so several devices scanning at once can collide
 * on the default rollback journal. WAL mode lets readers proceed during a
 * write and, with a busy timeout, lets writers queue instead of failing
 * immediately with SQLITE_BUSY.
 */
/**
 * SQLite serialises writers, so extra pooled connections only contend for the
 * same write lock and surface as P1008 timeouts. A single connection turns
 * that contention into an orderly queue, which is both faster and correct for
 * the handful of concurrent scanners this app is designed for.
 *
 * `pool_timeout` is the ceiling on how long a request waits for its turn.
 */
function buildDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL
  if (!raw || !raw.startsWith('file:')) return raw

  const [base, query] = raw.split('?')
  const params = new URLSearchParams(query ?? '')
  if (!params.has('connection_limit')) params.set('connection_limit', '1')
  if (!params.has('pool_timeout')) params.set('pool_timeout', '10')

  return `${base}?${params.toString()}`
}

const prismaClientSingleton = () => {
  const url = buildDatabaseUrl()
  const client = new PrismaClient(url ? { datasources: { db: { url } } } : undefined)

  // `journal_mode` and `busy_timeout` return a row, so they must go through
  // $queryRaw — $executeRaw rejects any statement that produces results.
  void (async () => {
    try {
      await client.$queryRawUnsafe('PRAGMA journal_mode = WAL;')
      await client.$queryRawUnsafe('PRAGMA busy_timeout = 5000;')
      await client.$executeRawUnsafe('PRAGMA synchronous = NORMAL;')
    } catch (error) {
      // Non-fatal: the app still works, just with more write contention.
      console.warn('Could not apply SQLite tuning pragmas:', error)
    }
  })()

  return client
}

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton>
} & typeof global

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma
