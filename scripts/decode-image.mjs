#!/usr/bin/env node
/**
 * Decode image files through the same pipeline the /api/decode route uses,
 * then parse the result with the production GS1/HIBC parser.
 *
 *   node scripts/decode-image.mjs test-barcode.png test-qr.png
 *
 * Useful for checking real label photos without a device.
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
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'

import { parseBarcode } from '../src/core/barcode.ts'

const execFileAsync = promisify(execFile)

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

async function decodeWithZxing(buffer, mode, rotate = 0) {
  try {
    let pipeline = sharp(buffer).rotate()
    if (rotate) pipeline = pipeline.rotate(rotate, { background: '#ffffff' })
    switch (mode) {
      case 'high-contrast':
        pipeline = pipeline.greyscale().normalise().linear(1.4, -18)
        break
      case 'sharpen':
        pipeline = pipeline.greyscale().sharpen({ sigma: 1.5 })
        break
      case 'inverted':
        pipeline = pipeline.greyscale().negate()
        break
      case 'clahe':
        pipeline = pipeline.greyscale().clahe({ width: 64, height: 64, maxSlope: 3 })
        break
      case 'threshold-high':
        pipeline = pipeline.greyscale().threshold(220)
        break
      case 'threshold-mid':
        pipeline = pipeline.greyscale().threshold(160)
        break
      default:
        pipeline = pipeline.greyscale()
    }

    const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength)
    const source = new RGBLuminanceSource(pixels, info.width, info.height)
    const bitmap = new BinaryBitmap(new HybridBinarizer(source))
    const result = createReader().decode(bitmap)
    return { text: result.getText(), symbology: BarcodeFormat[result.getBarcodeFormat()] }
  } catch {
    return null
  }
}

async function decodeWithDmtx(buffer) {
  const tempPath = join(tmpdir(), `labstock-${randomUUID()}.png`)
  try {
    await sharp(buffer).rotate().png().toFile(tempPath)
    const { stdout } = await execFileAsync('dmtxread', ['-N1', tempPath], {
      timeout: 5000,
      encoding: 'buffer',
      env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ''}` },
    })
    const text = Buffer.from(stdout).toString('latin1').trim()
    return text ? { text, symbology: 'DATA_MATRIX' } : null
  } catch {
    return null
  } finally {
    await unlink(tempPath).catch(() => {})
  }
}

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('usage: decode-image.mjs <image...>')
  process.exit(1)
}

let anyFailed = false

for (const file of files) {
  console.log(`\n━━ ${file} ━━`)
  let buffer
  try {
    buffer = await sharp(file).toBuffer()
  } catch (e) {
    console.log(`  ✗ could not read: ${e.message}`)
    anyFailed = true
    continue
  }

  const meta = await sharp(buffer).metadata()
  console.log(`  ${meta.width}×${meta.height} ${meta.format}`)

  // Keep in step with src/app/api/decode/route.ts.
  const passes = [
    ['dmtx', () => decodeWithDmtx(buffer)],
    ['standard', () => decodeWithZxing(buffer, 'standard')],
    ['high-contrast', () => decodeWithZxing(buffer, 'high-contrast')],
    ['clahe', () => decodeWithZxing(buffer, 'clahe')],
    ['threshold-high', () => decodeWithZxing(buffer, 'threshold-high')],
    ['threshold-mid', () => decodeWithZxing(buffer, 'threshold-mid')],
    ['sharpen', () => decodeWithZxing(buffer, 'sharpen')],
    ['rot90', () => decodeWithZxing(buffer, 'standard', 90)],
    ['rot270', () => decodeWithZxing(buffer, 'standard', 270)],
    ['rot180', () => decodeWithZxing(buffer, 'standard', 180)],
    ['rot90-contrast', () => decodeWithZxing(buffer, 'high-contrast', 90)],
    ['rot270-contrast', () => decodeWithZxing(buffer, 'high-contrast', 270)],
    ['inverted', () => decodeWithZxing(buffer, 'inverted')],
    ['clahe-rot90', () => decodeWithZxing(buffer, 'clahe', 90)],
  ]

  let hit = null
  let hitPass = ''
  for (const [name, run] of passes) {
    const result = await run()
    if (result) {
      hit = result
      hitPass = name
      break
    }
  }

  if (!hit) {
    console.log('  ✗ no barcode found in any pass')
    anyFailed = true
    continue
  }

  console.log(`  ✓ decoded on pass "${hitPass}" as ${hit.symbology}`)
  // Show FNC1 separators, which are invisible but decide field boundaries.
  console.log(`  raw: ${JSON.stringify(hit.text).replace(/\\u001d/g, '⟨GS⟩')}`)

  const parsed = parseBarcode(hit.text)
  console.log(`  format:  ${parsed.format}`)
  console.log(`  GTIN:    ${parsed.gtin || '(none)'}`)
  console.log(`  lot:     ${parsed.batch || '(none)'}`)
  console.log(`  expiry:  ${parsed.expirationDate || '(none)'}`)
  if (parsed.serial) console.log(`  serial:  ${parsed.serial}`)
  if (parsed.warnings.length) console.log(`  warnings: ${parsed.warnings.join('; ')}`)
}

console.log('')
process.exit(anyFailed ? 1 : 0)
