'use server'

import sharp from 'sharp'
import { MultiFormatReader, BarcodeFormat, DecodeHintType, BinaryBitmap, HybridBinarizer, RGBLuminanceSource } from '@zxing/library'

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
    
    // Pass 1: Standard
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
  let cleanText = text.replace(/[\(\)]/g, '')

  let gtin = ''
  let exp = ''
  let batch = ''

  // AI 01 -> GTIN (14 digits)
  if (cleanText.includes('01') && cleanText.length >= 16) {
    const idx = cleanText.indexOf('01')
    gtin = cleanText.substring(idx + 2, idx + 16)
  } else if (cleanText.length === 14 || cleanText.length === 13) {
    gtin = cleanText
  }

  // AI 17 -> Expiry YYMMDD
  if (cleanText.includes('17')) {
    const idx = cleanText.indexOf('17')
    const expRaw = cleanText.substring(idx + 2, idx + 8)
    if (expRaw.length === 6) {
      let year = "20" + expRaw.substring(0, 2)
      let month = expRaw.substring(2, 4)
      let day = expRaw.substring(4, 6)
      if (day === "00") day = "01"
      exp = `${year}-${month}-${day}`
    }
  }

  // AI 10 -> Batch/Lot (variable length, up to 20 chars)
  if (cleanText.includes('10')) {
    const idx = cleanText.indexOf('10')
    batch = cleanText.substring(idx + 2, Math.min(idx + 22, cleanText.length))
    const nextAI = batch.search(/17|21|01/)
    if (nextAI !== -1) {
      batch = batch.substring(0, nextAI)
    }
  }

  return { gtin, batch, expirationDate: exp, raw: text, format: 'GS1' }
}

// ─── HIBC Parser (EU IVDR / UDI compatible) ─────────────────────
// Structure: +<LIC><ProductCode>/<SecondaryData><CheckDigit>
//
// Secondary data date formats (flagged by $$ prefix):
//   $$2MMDDYY   -> Date format 2
//   $$3YYMMDD   -> Date format 3
//   $$4YYMMDDHH -> Date format 4
//   $$5YYJJJ    -> Date format 5 (Julian)
//   $$6YYYYMMDD -> Date format 6
//
// After the date, the remaining chars (until the check digit) are the lot/batch.
function parseHIBC(text: string): ParsedBarcode {
  // Strip the leading + and trailing check digit (Mod43)
  const body = text.substring(1, text.length - 1)

  let gtin = ''
  let batch = ''
  let exp = ''

  const slashIdx = body.indexOf('/')
  
  if (slashIdx === -1) {
    // No secondary data, entire body is the primary identifier
    gtin = body
    return { gtin, batch, expirationDate: exp, raw: text, format: 'HIBC' }
  }

  // Primary: LIC (4 chars) + Product/Catalog code
  gtin = body.substring(0, slashIdx)

  // Secondary: everything after the slash
  let secondary = body.substring(slashIdx + 1)

  // Check for date flag "$$" followed by format digit
  if (secondary.startsWith('$$') && secondary.length >= 3) {
    const formatFlag = secondary.charAt(2)
    secondary = secondary.substring(3)

    switch (formatFlag) {
      case '2': {
        // MMDDYY
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
        // YYMMDD
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
        // YYMMDDHH
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
        // YYJJJ (Julian date)
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
        // YYYYMMDD
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
        // Unknown date format flag, treat everything as batch
        batch = formatFlag + secondary
      }
    }
  } else if (secondary.startsWith('$')) {
    // Single $ prefix: lot number only, no date
    batch = secondary.substring(1)
  } else {
    // No special prefix, treat as lot number
    batch = secondary
  }

  // Trim any trailing whitespace from batch
  batch = batch.trim()

  return { gtin, batch, expirationDate: exp, raw: text, format: 'HIBC' }
}
