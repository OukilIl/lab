'use server'

import sharp from 'sharp'
import { MultiFormatReader, BarcodeFormat, DecodeHintType, BinaryBitmap, HybridBinarizer, RGBLuminanceSource } from '@zxing/library'
import { execSync } from 'child_process'
import { unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const reader = new MultiFormatReader()
const hints = new Map()
hints.set(DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.QR_CODE,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
])
hints.set(DecodeHintType.TRY_HARDER, true)
reader.setHints(hints)

export async function decodeBarcodeAction(formData: FormData) {
  const imageFile = formData.get('image') as File
  if (!imageFile) return { error: 'No image provided' }

  try {
    const buffer = Buffer.from(await imageFile.arrayBuffer())
    
    // Pass 0: Native dmtxread (Professional grade DataMatrix detection)
    const nativeResult = await attemptNativeDecode(buffer)
    if (nativeResult) return { success: true, ...nativeResult, pass: 'native-dmtx' }

    // Pass 1: Original (standard grayscale)
    let result = await attemptDecode(buffer, 'standard')
    if (result) return { success: true, ...result }

    // Pass 2: High Contrast
    result = await attemptDecode(buffer, 'high-contrast')
    if (result) return { success: true, ...result, pass: 'high-contrast' }

    // Pass 3: Sharpened
    result = await attemptDecode(buffer, 'sharp')
    if (result) return { success: true, ...result, pass: 'sharpened' }

    return { error: 'No barcode detected in any pass. Try getting closer or improving lighting.' }
  } catch (error: any) {
    console.error('Vision Action Error:', error)
    return { error: 'Optical processing failed: ' + error.message }
  }
}

async function attemptNativeDecode(buffer: Buffer) {
  const tempPath = join(tmpdir(), `scan-${Date.now()}.png`)
  try {
    // We use sharp to ensure the image is in a format dmtxread likes (PNG/JPG)
    await sharp(buffer).toFile(tempPath)
    
    // Try to run dmtxread (must be in PATH)
    const cmd = `export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && dmtxread "${tempPath}"`
    const output = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    
    if (output && output.trim()) {
      return parseBarcode(output.trim())
    }
  } catch (e) {
    // dmtxread returns non-zero exit code if no barcode found
  } finally {
    try { unlinkSync(tempPath) } catch (e) {}
  }
  return null
}

async function attemptDecode(buffer: Buffer, mode: 'standard' | 'high-contrast' | 'sharp') {
  try {
    let pipeline = sharp(buffer).ensureAlpha()

    if (mode === 'high-contrast') {
      pipeline = pipeline.normalize().linear(1.5, -0.2)
    } else if (mode === 'sharp') {
      pipeline = pipeline.sharpen()
    }

    const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true })
    
    const luminances = new Uint8ClampedArray(data.buffer)
    const source = new RGBLuminanceSource(luminances, info.width, info.height)
    const bitmap = new BinaryBitmap(new HybridBinarizer(source))

    const decoded = reader.decode(bitmap)
    const text = decoded.getText()

    // Auto-detect format and parse accordingly
    return parseBarcode(text)
  } catch (e) {
    return null
  }
}

// ─── Format Router ───────────────────────────────────────────────
function parseBarcode(text: string): ParsedBarcode {
  if (text.startsWith('+')) {
    return parseHIBC(text)
  }
  return parseGS1(text)
}

interface ParsedBarcode {
  gtin: string
  batch: string
  expirationDate: string
  raw: string
  format: 'GS1' | 'HIBC' | 'unknown'
}

// ─── GS1 Parser (AI-based) ──────────────────────────────────────
function parseGS1(text: string): ParsedBarcode {
  // Strip parentheses and any hidden control characters
  let cleanText = text.replace(/[\(\)]/g, '').replace(/[\x00-\x1F\x7F-\x9F]/g, '')

  let gtin = ''
  let exp = ''
  let batch = ''

  let i = 0
  while (i < cleanText.length) {
    const remaining = cleanText.substring(i)
    
    if (remaining.startsWith('01')) {
      // GTIN - Fixed length 14
      gtin = remaining.substring(2, 16)
      i += 16
    } else if (remaining.startsWith('17')) {
      // Expiry - Fixed length 6 (YYMMDD)
      const expRaw = remaining.substring(2, 8)
      if (expRaw.length === 6) {
        let year = "20" + expRaw.substring(0, 2)
        let month = expRaw.substring(2, 4)
        let day = expRaw.substring(4, 6)
        if (day === "00") day = "01"
        exp = `${year}-${month}-${day}`
      }
      i += 8
    } else if (remaining.startsWith('10')) {
      // Batch/Lot - Variable length
      const lotData = remaining.substring(2)
      // Look for next AI candidates (17, 21, 01)
      const nextAIIdx = lotData.search(/17|21|01/)
      if (nextAIIdx !== -1) {
        batch = lotData.substring(0, nextAIIdx)
        i += 2 + nextAIIdx
      } else {
        batch = lotData
        i = cleanText.length
      }
    } else if (remaining.startsWith('21')) {
      // Serial Number - Variable length
      const snData = remaining.substring(2)
      const nextAIIdx = snData.search(/01|17|10/)
      if (nextAIIdx !== -1) {
        i += 2 + nextAIIdx
      } else {
        i = cleanText.length
      }
    } else {
      i++
    }
  }

  // Fallback for simple GTIN-only strings
  if (!gtin && (cleanText.length === 14 || cleanText.length === 13)) {
    gtin = cleanText
  }

  return { gtin, batch, expirationDate: exp, raw: text, format: 'GS1' }
}

// ─── HIBC Parser (EU IVDR / UDI compatible) ─────────────────────
function parseHIBC(text: string): ParsedBarcode {
  // Strip the leading + and trailing check digit (Mod43)
  const body = text.substring(1, text.length - 1)

  let gtin = ''
  let batch = ''
  let exp = ''

  const slashIdx = body.indexOf('/')
  
  if (slashIdx === -1) {
    gtin = body
    return { gtin, batch, expirationDate: exp, raw: text, format: 'HIBC' }
  }

  gtin = body.substring(0, slashIdx)
  let secondary = body.substring(slashIdx + 1)

  if (secondary.startsWith('$$') && secondary.length >= 3) {
    const formatFlag = secondary.charAt(2)
    secondary = secondary.substring(3)

    switch (formatFlag) {
      case '2': {
        if (secondary.length >= 6) {
          const mm = secondary.substring(0, 2)
          const dd = secondary.substring(2, 4)
          const yy = secondary.substring(4, 6)
          exp = `20${yy}-${mm}-${dd}`
          batch = secondary.substring(6)
        }
        break
      }
      case '3': {
        if (secondary.length >= 6) {
          const yy = secondary.substring(0, 2)
          const mm = secondary.substring(2, 4)
          const dd = secondary.substring(4, 6)
          exp = `20${yy}-${mm}-${dd}`
          batch = secondary.substring(6)
        }
        break
      }
      case '4': {
        if (secondary.length >= 8) {
          const yy = secondary.substring(0, 2)
          const mm = secondary.substring(2, 4)
          const dd = secondary.substring(4, 6)
          exp = `20${yy}-${mm}-${dd}`
          batch = secondary.substring(8)
        }
        break
      }
      case '5': {
        if (secondary.length >= 5) {
          const yy = parseInt(secondary.substring(0, 2))
          const jjj = parseInt(secondary.substring(2, 5))
          const date = new Date(2000 + yy, 0, jjj)
          exp = date.toISOString().split('T')[0]
          batch = secondary.substring(5)
        }
        break
      }
      case '6': {
        if (secondary.length >= 8) {
          const yyyy = secondary.substring(0, 4)
          const mm = secondary.substring(4, 6)
          const dd = secondary.substring(6, 8)
          exp = `${yyyy}-${mm}-${dd}`
          batch = secondary.substring(8)
        }
        break
      }
      default: {
        batch = formatFlag + secondary
      }
    }
  } else if (secondary.startsWith('$')) {
    batch = secondary.substring(1)
  } else {
    batch = secondary
  }

  batch = batch.trim()
  return { gtin, batch, expirationDate: exp, raw: text, format: 'HIBC' }
}
