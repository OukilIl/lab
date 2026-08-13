#!/usr/bin/env node
/**
 * Assert that the native scan view shows the camera ONLY inside the scan
 * window, and the app background everywhere else.
 *
 *   node scripts/preview-scan.mjs out.png   # render first
 *   node scripts/check-scan-window.mjs out.png
 *
 * The preview paints a saturated stripe pattern where the ML Kit preview
 * would be, so any pixel that is not the app background is a leak.
 *
 * Coordinates are CSS pixels; the screenshot is captured at deviceScaleFactor
 * 2, so every sample is scaled. Getting that wrong silently samples the wrong
 * part of the image and makes this check meaningless.
 */

import sharp from 'sharp'

const file = process.argv[2] ?? 'scan-preview.png'
const SCALE = 2
const VIEW_W = 390
const VIEW_H = 844

// Must match --reticle-inset-y / --reticle-inset-x in globals.css.
const INSET_Y = 0.22
const INSET_X = 0.14

const win = {
  left: VIEW_W * INSET_X,
  right: VIEW_W * (1 - INSET_X),
  top: VIEW_H * INSET_Y,
  bottom: VIEW_H * (1 - INSET_Y),
}

async function sample(cssX, cssY) {
  const { data } = await sharp(file)
    .extract({ left: Math.round(cssX * SCALE), top: Math.round(cssY * SCALE), width: 2, height: 2 })
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { r: data[0], g: data[1], b: data[2] }
}

/**
 * The stripe stand-in is bright; every app surface in the dark theme is very
 * dark. Brightness separates them reliably — a relative-saturation test does
 * not, because near-black values like rgb(6,11,22) score highly on it.
 */
function isCamera({ r, g, b }) {
  return 0.299 * r + 0.587 * g + 0.114 * b > 80
}

const checks = [
  ['inside window — centre', 195, 422, true],
  ['inside window — near left edge', win.left + 12, 422, true],
  ['inside window — near right edge', win.right - 12, 422, true],
  ['inside window — near top edge', 195, win.top + 12, true],
  ['inside window — near bottom edge', 195, win.bottom - 12, true],
  ['outside — left of window', win.left - 14, 422, false],
  ['outside — right of window', win.right + 14, 422, false],
  ['outside — above window', 195, win.top - 20, false],
  // Offset horizontally: the "Searching…" hint sits centred just below the
  // window, and its white text is not a camera leak.
  ['outside — below window', 60, win.bottom + 20, false],
  ['outside — top-left corner', 12, 12, false],
  ['outside — bottom-right corner', VIEW_W - 12, VIEW_H - 12, false],
]

let failed = 0

for (const [label, x, y, wantCamera] of checks) {
  const px = await sample(x, y)
  const got = isCamera(px)
  const ok = got === wantCamera
  if (!ok) failed++
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(34)} rgb(${px.r},${px.g},${px.b})` +
      `  ${got ? 'camera' : 'app-bg'}`
  )
}

console.log(
  failed === 0
    ? '\n  ✓ camera is confined to the scan window\n'
    : `\n  ✗ ${failed} check(s) failed — camera is leaking outside the window\n`
)
process.exit(failed === 0 ? 0 : 1)
