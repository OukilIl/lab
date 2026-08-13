#!/usr/bin/env node
/**
 * Screenshot helper driven over the DevTools Protocol.
 *
 * Chrome's `--screenshot` flag ignores `--window-size` for layout (it renders
 * at ~500px then crops), which makes it useless for checking mobile layout.
 * Emulating the viewport via CDP gives a true device-width render.
 *
 *   node scripts/screenshot.mjs <url> <output.png> [width] [height]
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [, , url, output, widthArg, heightArg] = process.argv
if (!url || !output) {
  console.error('usage: screenshot.mjs <url> <output.png> [width] [height]')
  process.exit(1)
}

const width = Number(widthArg ?? 390)
const height = Number(heightArg ?? 844)

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const profile = mkdtempSync(join(tmpdir(), 'labshot-'))
const port = 9200 + Math.floor(Math.random() * 500)

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--no-first-run',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' }
)

const cleanup = () => {
  chrome.kill()
  try {
    rmSync(profile, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
}

async function waitForDevTools() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (res.ok) return (await res.json()).webSocketDebuggerUrl
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('Chrome DevTools did not become available')
}

try {
  const wsUrl = await waitForDevTools()
  const ws = new WebSocket(wsUrl)
  let nextId = 1
  const pending = new Map()

  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    })

  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(msg.error.message))
      else resolve(msg.result)
    }
  }

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })

  await send('Page.enable', {}, sessionId)
  // The key step: emulate a real mobile viewport so layout uses `width`.
  await send(
    'Emulation.setDeviceMetricsOverride',
    { width, height, deviceScaleFactor: 2, mobile: true },
    sessionId
  )

  // Optionally pre-seed app state so screenshots skip onboarding/login.
  // LABSHOT_SETTINGS / LABSHOT_TOKEN carry JSON written to localStorage
  // before the app's own scripts run.
  const seedSettings = process.env.LABSHOT_SETTINGS
  const seedToken = process.env.LABSHOT_TOKEN
  if (seedSettings || seedToken) {
    // Capacitor Preferences namespaces web storage under 'CapacitorStorage.',
    // so seed both that key and the plain one the settings loader falls back to.
    const script = [
      seedSettings
        ? `localStorage.setItem('CapacitorStorage.labstock.settings', ${JSON.stringify(seedSettings)});
           localStorage.setItem('labstock.settings', ${JSON.stringify(seedSettings)});`
        : '',
      seedToken
        ? `localStorage.setItem('CapacitorStorage.labstock.token', ${JSON.stringify(seedToken)});`
        : '',
      process.env.LABSHOT_THEME
        ? `localStorage.setItem('labstock.theme', ${JSON.stringify(process.env.LABSHOT_THEME)});`
        : '',
      process.env.LABSHOT_LANG
        ? `localStorage.setItem('labstock.language', ${JSON.stringify(process.env.LABSHOT_LANG)});`
        : '',
    ].join('\n')

    await send('Page.addScriptToEvaluateOnNewDocument', { source: script }, sessionId)
  }

  await send('Page.navigate', { url }, sessionId)
  await new Promise((r) => setTimeout(r, 4000))

  const { data } = await send(
    'Page.captureScreenshot',
    { format: 'png', captureBeyondViewport: false },
    sessionId
  )

  writeFileSync(output, Buffer.from(data, 'base64'))

  // Report the layout width actually used, to catch emulation failures.
  const { result } = await send(
    'Runtime.evaluate',
    { expression: 'window.innerWidth + "x" + window.innerHeight', returnByValue: true },
    sessionId
  )
  console.log(`${output} — viewport ${result.value}`)

  ws.close()
} finally {
  cleanup()
}
