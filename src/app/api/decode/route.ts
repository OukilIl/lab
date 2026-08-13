/**
 * Server-side barcode decoding.
 *
 * This is a fallback for the web build and for labels that on-device scanning
 * cannot read. Native apps decode with ML Kit and never call this.
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

import { parseBarcode } from '@/core/barcode'
import { apiError, json, preflight, withAuth } from '@/lib/server/api'

export const dynamic = 'force-dynamic'

const execFileAsync = promisify(execFile)

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024
const DMTX_TIMEOUT_MS = 5_000

/**
 * A fresh reader per call. `MultiFormatReader` carries decode state, so a
 * module-level singleton could interleave between concurrent requests.
 */
function createReader(): MultiFormatReader {
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

type Preprocess =
  | 'standard'
  | 'high-contrast'
  | 'sharpen'
  | 'inverted'
  | 'clahe'
  | 'threshold-high'
  | 'threshold-mid'

/**
 * @param rotate degrees to rotate before decoding. ZXing's DataMatrix and QR
 *   readers are not fully rotation-invariant, and a label on a vial or tube is
 *   very often photographed sideways.
 */
async function decodeWithZxing(
  buffer: Buffer,
  mode: Preprocess,
  rotate = 0
): Promise<string | null> {
  try {
    let pipeline = sharp(buffer).rotate() // honour EXIF orientation first
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
        // Local histogram equalisation: recovers codes where a glare hotspot
        // washes out one region while the rest is correctly exposed. A global
        // contrast stretch cannot fix that, because the image as a whole
        // already spans the full range.
        pipeline = pipeline.greyscale().clahe({ width: 64, height: 64, maxSlope: 3 })
        break
      case 'threshold-high':
        // Hard binarisation with a bright cut-off. This is what recovers a
        // glare-blown label: everything short of the hotspot collapses to
        // black, restoring module contrast that CLAHE cannot.
        pipeline = pipeline.greyscale().threshold(220)
        break
      case 'threshold-mid':
        pipeline = pipeline.greyscale().threshold(160)
        break
      default:
        pipeline = pipeline.greyscale()
    }

    // Force a known 4-channel layout so the luminance stride below is correct.
    const { data, info } = await pipeline
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    // Sharp returns a pooled Buffer, so `data.buffer` may be larger than and
    // offset from this view. Passing it directly would read the wrong bytes;
    // the byteOffset/byteLength window is required.
    const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength)

    const source = new RGBLuminanceSource(pixels, info.width, info.height)
    const bitmap = new BinaryBitmap(new HybridBinarizer(source))

    return createReader().decode(bitmap).getText()
  } catch {
    return null
  }
}

/**
 * libdmtx handles damaged or low-contrast DataMatrix far better than ZXing.
 * Optional: absent binaries simply skip this pass.
 */
async function decodeWithDmtx(buffer: Buffer): Promise<string | null> {
  const tempPath = join(tmpdir(), `labstock-${randomUUID()}.png`)

  try {
    await sharp(buffer).rotate().png().toFile(tempPath)

    // execFile with an argument array: no shell, so the path cannot be
    // interpreted as a command even if it ever became caller-influenced.
    const { stdout } = await execFileAsync('dmtxread', ['-N1', tempPath], {
      timeout: DMTX_TIMEOUT_MS,
      encoding: 'buffer',
      env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ''}` },
    })

    // Decode as latin1 to preserve FNC1 (0x1d) and other control bytes that
    // the GS1 parser depends on; utf8 would replace them.
    const text = Buffer.from(stdout).toString('latin1').trim()
    return text || null
  } catch {
    return null
  } finally {
    await unlink(tempPath).catch(() => {})
  }
}

export const POST = withAuth(async (request) => {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.includes('multipart/form-data')) {
    return apiError('Expected a multipart/form-data upload', 415)
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return apiError('Could not read the uploaded image', 400)
  }

  const file = form.get('image')
  if (!(file instanceof File)) return apiError('No image was provided', 400, 'VALIDATION')
  if (file.size === 0) return apiError('The uploaded image is empty', 400, 'VALIDATION')
  if (file.size > MAX_UPLOAD_BYTES) {
    return apiError('The image is too large (max 12 MB)', 413, 'TOO_LARGE')
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  // Confirm it really is an image before handing it to the decoders.
  try {
    const meta = await sharp(buffer).metadata()
    if (!meta.width || !meta.height) return apiError('Unsupported image format', 400)
  } catch {
    return apiError('Unsupported image format', 400)
  }

  // Ordered cheapest and most-likely first: most captures resolve on the
  // first two or three passes, and later ones only run when those fail.
  // Rotations are included because ZXing is not reliably rotation-invariant
  // and vial labels are frequently photographed sideways.
  const passes: Array<{ name: string; run: () => Promise<string | null> }> = [
    { name: 'dmtx', run: () => decodeWithDmtx(buffer) },
    { name: 'standard', run: () => decodeWithZxing(buffer, 'standard') },
    { name: 'high-contrast', run: () => decodeWithZxing(buffer, 'high-contrast') },
    { name: 'clahe', run: () => decodeWithZxing(buffer, 'clahe') },
    { name: 'threshold-high', run: () => decodeWithZxing(buffer, 'threshold-high') },
    { name: 'threshold-mid', run: () => decodeWithZxing(buffer, 'threshold-mid') },
    { name: 'sharpen', run: () => decodeWithZxing(buffer, 'sharpen') },
    { name: 'rot90', run: () => decodeWithZxing(buffer, 'standard', 90) },
    { name: 'rot270', run: () => decodeWithZxing(buffer, 'standard', 270) },
    { name: 'rot180', run: () => decodeWithZxing(buffer, 'standard', 180) },
    { name: 'rot90-contrast', run: () => decodeWithZxing(buffer, 'high-contrast', 90) },
    { name: 'rot270-contrast', run: () => decodeWithZxing(buffer, 'high-contrast', 270) },
    { name: 'inverted', run: () => decodeWithZxing(buffer, 'inverted') },
    { name: 'clahe-rot90', run: () => decodeWithZxing(buffer, 'clahe', 90) },
  ]

  for (const pass of passes) {
    const text = await pass.run()
    if (text) {
      return json({ ...parseBarcode(text), pass: pass.name })
    }
  }

  return apiError(
    'No barcode found. Move closer, steady the camera, or improve the lighting.',
    422,
    'NO_BARCODE'
  )
})

export const OPTIONS = preflight
