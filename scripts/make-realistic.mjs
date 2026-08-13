#!/usr/bin/env node
/**
 * Degrade clean barcode images to simulate real phone-camera capture:
 * motion blur, low light, glare, perspective from an angled shot, JPEG
 * artefacts, and small on-screen size.
 *
 *   node scripts/make-realistic.mjs <source.png> <outDir>
 *
 * The point is to find where decoding actually breaks, rather than only
 * testing pristine renders.
 */

import sharp from 'sharp'
import { basename, join } from 'node:path'
import { mkdirSync } from 'node:fs'

const [, , source, outDir = 'test-realistic'] = process.argv
if (!source) {
  console.error('usage: make-realistic.mjs <source.png> [outDir]')
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })
const stem = basename(source).replace(/\.[^.]+$/, '')

/** Put the code on a larger "label" so it is not edge-to-edge. */
async function onLabel(buffer, scale = 0.45) {
  const meta = await sharp(buffer).metadata()
  const canvasW = Math.round(meta.width / scale)
  const canvasH = Math.round(meta.height / scale)
  return sharp({
    create: {
      width: canvasW,
      height: canvasH,
      channels: 3,
      background: { r: 246, g: 245, b: 240 }, // off-white label stock
    },
  })
    .composite([{ input: buffer, gravity: 'center' }])
    .png()
    .toBuffer()
}

const variants = {
  /** Baseline: printed on a label, photographed square-on. */
  'clean-label': async (b) => onLabel(b),

  /** Hand-held shake. */
  'motion-blur': async (b) => sharp(await onLabel(b)).blur(2.2).png().toBuffer(),

  /** Dim lab bench. */
  'low-light': async (b) =>
    sharp(await onLabel(b))
      .linear(0.42, 12)
      .blur(0.7)
      .png()
      .toBuffer(),

  /** Overhead light reflecting off glossy label stock. */
  glare: async (b) => {
    const labeled = await onLabel(b)
    const { width, height } = await sharp(labeled).metadata()
    const glareSvg = Buffer.from(
      `<svg width="${width}" height="${height}">
         <defs><radialGradient id="g" cx="34%" cy="26%" r="42%">
           <stop offset="0%" stop-color="#fff" stop-opacity="0.92"/>
           <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
         </radialGradient></defs>
         <rect width="100%" height="100%" fill="url(#g)"/>
       </svg>`
    )
    return sharp(labeled).composite([{ input: glareSvg, blend: 'over' }]).png().toBuffer()
  },

  /** Sensor noise from a cheap phone in poor light. */
  noisy: async (b) => {
    const labeled = await onLabel(b)
    const { width, height } = await sharp(labeled).metadata()
    const noise = Buffer.alloc(width * height * 3)
    for (let i = 0; i < noise.length; i++) noise[i] = 128 + Math.floor((Math.random() - 0.5) * 90)
    const noiseImg = await sharp(noise, { raw: { width, height, channels: 3 } }).png().toBuffer()
    return sharp(labeled)
      .composite([{ input: noiseImg, blend: 'overlay' }])
      .png()
      .toBuffer()
  },

  /** Photographed from ~30° off-axis. */
  perspective: async (b) => {
    const labeled = await onLabel(b)
    return sharp(labeled)
      .affine([1, 0.22, 0.09, 1], { background: { r: 246, g: 245, b: 240 } })
      .png()
      .toBuffer()
  },

  /** Small in frame, as when the user stands too far back. */
  'small-distant': async (b) => {
    const labeled = await onLabel(b, 0.22)
    return sharp(labeled).resize(320).png().toBuffer()
  },

  /** Heavy JPEG compression, as from a messaging app. */
  'jpeg-artifacts': async (b) =>
    sharp(await onLabel(b)).jpeg({ quality: 28 }).toBuffer(),

  /** Rotated 90°, e.g. a vial label read sideways. */
  rotated: async (b) => sharp(await onLabel(b)).rotate(90).png().toBuffer(),

  /** Combination: the realistic worst case. */
  'worst-case': async (b) =>
    sharp(await onLabel(b))
      .linear(0.55, 8)
      .blur(1.4)
      .affine([1, 0.12, 0.06, 1], { background: { r: 246, g: 245, b: 240 } })
      .jpeg({ quality: 42 })
      .toBuffer(),
}

const input = await sharp(source).png().toBuffer()

for (const [name, make] of Object.entries(variants)) {
  const out = await make(input)
  const ext = name.includes('jpeg') || name === 'worst-case' ? 'jpg' : 'png'
  const path = join(outDir, `${stem}--${name}.${ext}`)
  await sharp(out).toFile(path)
  console.log(`  ${path}`)
}

console.log(`\nWrote ${Object.keys(variants).length} variants to ${outDir}/`)
