#!/usr/bin/env node
/**
 * Render the Scan screen in its *native* state, where the ML Kit preview sits
 * behind the WebView and CSS decides what shows through.
 *
 * A plain screenshot cannot show this: in a browser there is no native camera
 * layer, and `body.scanner-active` is never set. Here the class is applied
 * manually and a photo is painted behind the page, so the dimming can be
 * verified without a device.
 *
 *   node scripts/preview-scan.mjs <out.png>
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const output = process.argv[2] ?? 'scan-preview.png'
const width = 390
const height = 844

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const profile = mkdtempSync(join(tmpdir(), 'labscan-'))
const port = 9700 + Math.floor(Math.random() * 200)

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

async function wait() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (res.ok) return (await res.json()).webSocketDebuggerUrl
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('DevTools unavailable')
}

try {
  const ws = new WebSocket(await wait())
  let id = 1
  const pending = new Map()
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const n = id++
      pending.set(n, { resolve, reject })
      ws.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) }))
    })

  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = rej
  })
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id)
      pending.delete(m.id)
      m.error ? reject(new Error(m.error.message)) : resolve(m.result)
    }
  }

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  await send('Page.enable', {}, sessionId)
  await send(
    'Emulation.setDeviceMetricsOverride',
    { width, height, deviceScaleFactor: 2, mobile: true },
    sessionId
  )

  await send(
    'Page.addScriptToEvaluateOnNewDocument',
    {
      // Remote mode: the local SQLite backend cannot initialise in headless
      // Chrome (there is no jeep-sqlite element), which leaves the app stuck
      // on its loading gate and makes the preview render nothing at all.
      source:
        `const s = '{"mode":"remote","serverUrl":"http://localhost:3000","configured":true}';` +
        `localStorage.setItem('CapacitorStorage.labstock.settings', s);` +
        `localStorage.setItem('labstock.settings', s);` +
        `localStorage.setItem('CapacitorStorage.labstock.token', ${JSON.stringify(
          process.env.LABSHOT_TOKEN ?? ''
        )});`,
    },
    sessionId
  )

  await send('Page.navigate', { url: 'http://localhost:3000/scan' }, sessionId)
  await new Promise((r) => setTimeout(r, 4000))

  // Stand in for the native camera layer.
  //
  // The preview must sit BEHIND the page, exactly as ML Kit's does: it is
  // painted on <html>, and <body> is made transparent so the app's own
  // surround (the scrim's box-shadow) is what hides it. Painting the stripes
  // on top would make every test report a leak regardless of the CSS.
  await send(
    'Runtime.evaluate',
    {
      expression: `
        // The stand-in camera layer must sit BEHIND the page and survive the
        // page going fully transparent. html/body are both transparent while
        // scanning, so the backdrop cannot live on either — it goes in a
        // fixed element at a negative z-index, which is the closest DOM
        // equivalent of the native preview behind the WebView.
        const cam = document.createElement('div');
        cam.id = 'fake-camera';
        cam.style.cssText =
          'position:fixed;inset:0;z-index:-1;' +
          'background:repeating-linear-gradient(45deg,#e8b04b 0 40px,#3aa0d8 40px 80px)';
        document.documentElement.appendChild(cam);

        document.documentElement.classList.add('scanner-active');
        document.body.classList.add('scanner-active');

        // Replace the "camera off" placeholder with the live-scan overlay,
        // which is what renders once a real device has a camera.
        const frame = document.querySelector('.scanner-frame');
        if (frame) {
          frame.querySelectorAll('.scanner-overlay').forEach((n) => n.remove());
          frame.insertAdjacentHTML('beforeend',
            '<div class="scanner-overlay">' +
              '<div class="scanner-scrim"></div>' +
              '<div class="reticle">' +
                '<span class="reticle-corner tl"></span><span class="reticle-corner tr"></span>' +
                '<span class="reticle-corner bl"></span><span class="reticle-corner br"></span>' +
                '<div class="scan-sweep"></div>' +
              '</div>' +
              '<div class="scanner-hint">Searching for a barcode…</div>' +
            '</div>');
        }
        'ok'
      `,
      returnByValue: true,
    },
    sessionId
  )

  await new Promise((r) => setTimeout(r, 700))

  const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId)
  writeFileSync(output, Buffer.from(data, 'base64'))
  console.log(`${output} written`)
  ws.close()
} finally {
  cleanup()
}
