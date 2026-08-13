#!/usr/bin/env node
/**
 * Image-level decode test: runs real barcode PNGs through the full pipeline
 * and asserts the extracted fields.
 *
 *   npm run test:images
 *
 * The unit tests cover the parser given a string; this covers everything
 * before that — binarisation, ZXing/libdmtx, and byte handling — which is
 * where FNC1 separators and glare actually get lost.
 *
 * Regenerate the fixtures with:
 *   swift scripts/make-fixtures.swift test-fixtures
 */

import sharp from 'sharp'
import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
} from '@zxing/library'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'

import { parseBarcode } from '../src/core/barcode.ts'

const execFileAsync = promisify(execFile)
const DIR = 'test-fixtures'

function createReader() {
  const reader = new MultiFormatReader()
  const hints = new Map()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.DATA_MATRIX,
    BarcodeFormat.QR_CODE,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.ITF,
  ])
  hints.set(DecodeHintType.TRY_HARDER, true)
  reader.setHints(hints)
  return reader
}

async function zxing(buffer, mode, rotate = 0) {
  try {
    let p = sharp(buffer).rotate()
    if (rotate) p = p.rotate(rotate, { background: '#ffffff' })
    if (mode === 'high-contrast') p = p.greyscale().normalise().linear(1.4, -18)
    else if (mode === 'clahe') p = p.greyscale().clahe({ width: 64, height: 64, maxSlope: 3 })
    else if (mode === 'threshold-high') p = p.greyscale().threshold(220)
    else if (mode === 'threshold-mid') p = p.greyscale().threshold(160)
    else if (mode === 'sharpen') p = p.greyscale().sharpen({ sigma: 1.5 })
    else if (mode === 'inverted') p = p.greyscale().negate()
    else p = p.greyscale()

    const { data, info } = await p.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const px = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength)
    const bmp = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(px, info.width, info.height)))
    return createReader().decode(bmp).getText()
  } catch {
    return null
  }
}

async function dmtx(buffer) {
  const tmp = join(tmpdir(), `labstock-${randomUUID()}.png`)
  try {
    await sharp(buffer).rotate().png().toFile(tmp)
    const { stdout } = await execFileAsync('dmtxread', ['-N1', tmp], {
      timeout: 5000,
      encoding: 'buffer',
      env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ''}` },
    })
    const text = Buffer.from(stdout).toString('latin1').trim()
    return text || null
  } catch {
    return null
  } finally {
    await unlink(tmp).catch(() => {})
  }
}

async function decode(file) {
  const buffer = await sharp(file).toBuffer()
  const passes = [
    () => dmtx(buffer),
    () => zxing(buffer, 'standard'),
    () => zxing(buffer, 'high-contrast'),
    () => zxing(buffer, 'clahe'),
    () => zxing(buffer, 'threshold-high'),
    () => zxing(buffer, 'threshold-mid'),
    () => zxing(buffer, 'sharpen'),
    () => zxing(buffer, 'standard', 90),
    () => zxing(buffer, 'standard', 270),
    () => zxing(buffer, 'standard', 180),
    () => zxing(buffer, 'inverted'),
  ]
  for (const run of passes) {
    const text = await run()
    if (text) return parseBarcode(text)
  }
  return null
}

const GTIN = '03453120000011'
const EXPIRY = '2027-11-25'

/** file → expected fields */
const EXPECTED = {
  'gs1-qr-basic.png': { gtin: GTIN, expirationDate: EXPIRY },
  'gs1-qr-lot.png': { gtin: GTIN, expirationDate: EXPIRY, batch: 'ABCD1234' },
  'gs1-qr-numeric-lot.png': { gtin: GTIN, expirationDate: EXPIRY, batch: '0114' },
  'gs1-qr-serial.png': { gtin: GTIN, expirationDate: EXPIRY, batch: 'LOT9', serial: '12345678' },
  'gs1-qr-parens.png': { gtin: GTIN, expirationDate: EXPIRY, batch: 'ABCD1234' },
  'ean13.png': { gtin: '5012345678900' },
  'code128-ean.png': { gtin: '5012345678900' },
  'hibc-qr.png': { format: 'HIBC', batch: 'LOT42', expirationDate: EXPIRY },
  // Known-hard: a lot containing "17" needs FNC1 to survive. Some encoders
  // drop it, so the parser must still recover the split — see barcode.test.ts.
  'gs1-qr-fnc1-lot.png': { gtin: GTIN, batch: 'AB17CD', expirationDate: EXPIRY, optional: true },
}

if (!existsSync(DIR)) {
  console.error(`Missing ${DIR}/. Generate it with:\n  swift scripts/make-fixtures.swift ${DIR}`)
  process.exit(1)
}

let passed = 0
let failed = 0
let skipped = 0

console.log('\nDecoding real barcode images through the full pipeline\n')

for (const [file, want] of Object.entries(EXPECTED)) {
  const path = join(DIR, file)
  if (!existsSync(path)) {
    console.log(`  ~ ${file} (missing, skipped)`)
    skipped++
    continue
  }

  const got = await decode(path)
  if (!got) {
    if (want.optional) {
      console.log(`  ~ ${file} — could not decode (known-hard, not fatal)`)
      skipped++
    } else {
      console.log(`  ✗ ${file} — no barcode detected`)
      failed++
    }
    continue
  }

  const mismatches = Object.entries(want)
    .filter(([k]) => k !== 'optional')
    .filter(([k, v]) => got[k] !== v)
    .map(([k, v]) => `${k}: expected ${JSON.stringify(v)}, got ${JSON.stringify(got[k])}`)

  if (mismatches.length === 0) {
    console.log(`  ✓ ${file}`)
    passed++
  } else {
    console.log(`  ✗ ${file}`)
    for (const m of mismatches) console.log(`      ${m}`)
    failed++
  }
}

console.log(`\n  ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}\n`)
process.exit(failed === 0 ? 0 : 1)
