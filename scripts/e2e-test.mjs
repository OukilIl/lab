#!/usr/bin/env node
/**
 * End-to-end API check against a running LabStock server.
 *
 * Exercises auth, validation, and the two concurrency-sensitive paths
 * (restock accounting and simultaneous usage logging).
 *
 *   DATABASE_URL=file:/tmp/x.db npm start &
 *   node scripts/e2e-test.mjs
 */

const BASE = process.env.LABSTOCK_URL ?? 'http://localhost:3000'

let token = ''
let passed = 0
let failed = 0

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
    failed++
  }
}

async function api(method, path, body, useAuth = true) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (useAuth && token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  })

  let data = null
  const text = await res.text()
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  return { status: res.status, data }
}

console.log('\n── Health ──')
{
  const r = await api('GET', '/api/health', undefined, false)
  check('health returns ok', r.status === 200 && r.data?.status === 'ok', `got ${r.status}`)
}

console.log('\n── Authentication is enforced ──')
for (const [method, path] of [
  ['GET', '/api/dashboard'],
  ['GET', '/api/products'],
  ['GET', '/api/usage'],
  ['POST', '/api/batches'],
]) {
  const r = await api(method, path, method === 'POST' ? {} : undefined, false)
  check(`${method} ${path} rejects anonymous`, r.status === 401, `got ${r.status}`)
}
{
  const res = await fetch(`${BASE}/api/dashboard`, {
    headers: { Cookie: 'session=forged.token.value' },
    signal: AbortSignal.timeout(10_000),
  })
  check('forged session cookie rejected', res.status === 401, `got ${res.status}`)

  const res2 = await fetch(`${BASE}/api/dashboard`, {
    headers: { Authorization: 'Bearer forged.token.value' },
    signal: AbortSignal.timeout(10_000),
  })
  check('forged bearer token rejected', res2.status === 401, `got ${res2.status}`)
}

console.log('\n── Setup ──')
{
  const status = await api('GET', '/api/auth/setup', undefined, false)
  if (status.data?.needsSetup) {
    const weak = await api('POST', '/api/auth/setup', { username: 'x', password: '123' }, false)
    check('weak password rejected', weak.status === 400, `got ${weak.status}`)

    const r = await api(
      'POST',
      '/api/auth/setup',
      { username: 'labadmin', password: 'correct-horse-battery' },
      false
    )
    check('admin created', r.status === 201 && Boolean(r.data?.token), `got ${r.status}`)
    token = r.data?.token ?? ''

    const again = await api(
      'POST',
      '/api/auth/setup',
      { username: 'intruder', password: 'password1234' },
      false
    )
    check('second setup blocked', again.status === 409, `got ${again.status}`)
  } else {
    const r = await api(
      'POST',
      '/api/auth/login',
      { username: 'labadmin', password: 'correct-horse-battery' },
      false
    )
    check('login succeeds', r.status === 200 && Boolean(r.data?.token), `got ${r.status}`)
    token = r.data?.token ?? ''
  }

  const bad = await api('POST', '/api/auth/login', { username: 'labadmin', password: 'wrong' }, false)
  check('wrong password rejected', bad.status === 401, `got ${bad.status}`)
}

if (!token) {
  console.log('\nNo token; aborting.')
  process.exit(1)
}

console.log('\n── Products ──')
const GTIN = `0345312000${Math.floor(Math.random() * 9000 + 1000)}`
{
  const r = await api('POST', '/api/products', {
    gtin: GTIN,
    name: 'Sterile Pipette Tips',
    targetStock: 500,
    lowStockThresholdPct: 20,
    expirationWarningDays: 30,
  })
  check('product created', r.status === 200, `got ${r.status}`)

  const dup = await api('POST', '/api/products', {
    gtin: GTIN,
    name: 'Duplicate',
    targetStock: 10,
    lowStockThresholdPct: 20,
    expirationWarningDays: 30,
  })
  check('duplicate GTIN rejected', dup.status === 409, `got ${dup.status}`)

  const invalid = await api('POST', '/api/products', {
    gtin: 'X1',
    name: 'Bad',
    targetStock: 10,
    lowStockThresholdPct: 500,
    expirationWarningDays: 30,
  })
  check('out-of-range threshold rejected', invalid.status === 400, `got ${invalid.status}`)
}

console.log('\n── Batches: restock must not rewrite initialQuantity ──')
let batchId = ''
{
  const first = await api('POST', '/api/batches', {
    gtin: GTIN,
    batchNumber: 'LOT-A',
    expirationDate: '2026-12-01',
    quantity: 50,
  })
  check('batch created with 50', first.status === 200 && first.data?.currentQuantity === 50)
  batchId = first.data?.id ?? ''

  const restock = await api('POST', '/api/batches', {
    gtin: GTIN,
    batchNumber: 'LOT-A',
    expirationDate: '2026-12-01',
    quantity: 30,
  })
  check(
    'restock raises currentQuantity to 80',
    restock.data?.currentQuantity === 80,
    `got ${restock.data?.currentQuantity}`
  )
  check(
    'restock leaves initialQuantity at 50 (regression)',
    restock.data?.initialQuantity === 50,
    `got ${restock.data?.initialQuantity}`
  )

  const orphan = await api('POST', '/api/batches', {
    gtin: '00000000000000',
    batchNumber: 'X',
    expirationDate: '2026-12-01',
    quantity: 1,
  })
  check('batch for unknown GTIN rejected', orphan.status === 404, `got ${orphan.status}`)

  const badDate = await api('POST', '/api/batches', {
    gtin: GTIN,
    batchNumber: 'LOT-B',
    expirationDate: '2026-02-30',
    quantity: 1,
  })
  check('impossible date rejected', badDate.status === 400, `got ${badDate.status}`)
}

console.log('\n── Usage: stock cannot go negative ──')
{
  const over = await api('POST', '/api/usage', { batchId, quantity: 99999 })
  check('over-consumption rejected', over.status === 400, `got ${over.status}`)

  const zero = await api('POST', '/api/usage', { batchId, quantity: 0 })
  check('zero quantity rejected', zero.status === 400, `got ${zero.status}`)

  const one = await api('POST', '/api/usage', { batchId, quantity: 1 })
  check('single usage recorded', one.status === 200 && one.data?.currentQuantity === 79)
}

console.log('\n── Concurrency: simultaneous scans of one batch ──')
{
  const products = await api('GET', '/api/products')
  const batch = products.data?.[0]?.batches?.find((b) => b.id === batchId)
  const before = batch?.currentQuantity ?? 0

  const CONCURRENT = 25
  const started = Date.now()
  const results = await Promise.all(
    Array.from({ length: CONCURRENT }, () =>
      api('POST', '/api/usage', { batchId, quantity: 1 }).catch((e) => ({
        status: 0,
        data: String(e),
      }))
    )
  )
  const elapsed = Date.now() - started

  const ok = results.filter((r) => r.status === 200).length
  const busy = results.filter((r) => r.status === 503).length
  const server = results.filter((r) => r.status >= 500 && r.status !== 503).length
  const other = results.filter((r) => r.status !== 200 && r.status < 500).length

  console.log(
    `    ${CONCURRENT} requests in ${elapsed}ms — ${ok} ok, ${busy} busy(503), ${other} 4xx, ${server} 5xx`
  )

  const after = (await api('GET', '/api/products')).data?.[0]?.batches?.find(
    (b) => b.id === batchId
  )?.currentQuantity

  check(
    `stock accounting exact (${before} − ${ok} = ${after})`,
    after === before - ok,
    `expected ${before - ok}, got ${after}`
  )
  check('stock never negative', after >= 0, `got ${after}`)
  check('no unexplained 5xx responses', server === 0, `got ${server}`)
}

console.log('\n── Dashboard ──')
{
  const r = await api('GET', '/api/dashboard')
  check('dashboard returns totals', r.status === 200 && typeof r.data?.totalUnits === 'number')
  check('usage log populated', (await api('GET', '/api/usage')).data?.length > 0)
}

console.log(`\n${'─'.repeat(46)}`)
console.log(`  ${passed} passed, ${failed} failed`)
console.log('─'.repeat(46))
process.exit(failed === 0 ? 0 : 1)
