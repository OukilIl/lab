/**
 * GS1 / HIBC barcode parsing.
 *
 * This module is environment-agnostic: it runs in the browser, in a Node
 * server, and inside the Capacitor WebView. Keep it free of imports.
 *
 * The previous implementation stripped all control characters before parsing,
 * which destroyed the FNC1 (\x1d) group separator that terminates
 * variable-length fields. It then guessed field boundaries with an unanchored
 * regex, so a lot code containing "17" or "21" silently produced a corrupt
 * expiry date. This version preserves FNC1 and uses the real AI table.
 */

export type BarcodeFormat = 'GS1' | 'HIBC' | 'RAW'

export interface ParsedBarcode {
  gtin: string
  batch: string
  /** ISO `YYYY-MM-DD`, or '' when the symbol carried no expiry. */
  expirationDate: string
  serial: string
  raw: string
  format: BarcodeFormat
  /** Non-fatal problems; the caller should surface these for confirmation. */
  warnings: string[]
}

/** FNC1 group separator, as emitted by most scanners. */
const GS = '\x1d'

/**
 * GS1 Application Identifiers with a fixed DATA length, excluding the AI
 * digits themselves (these are the lengths published in the GS1 General
 * Specifications). Anything absent from this table is variable-length and
 * must be terminated by FNC1 or by the end of the string.
 */
const FIXED_LENGTH_AI: Record<string, number> = {
  '00': 18, // SSCC
  '01': 14, // GTIN
  '02': 14, // GTIN of contained trade items
  '03': 14,
  '04': 16,
  '11': 6, // Production date
  '12': 6, // Due date
  '13': 6, // Packaging date
  '14': 6,
  '15': 6, // Best before
  '16': 6, // Sell by
  '17': 6, // Expiration date
  '18': 6,
  '19': 6,
  '20': 2,
  '31': 6,
  '32': 6,
  '33': 6,
  '34': 6,
  '35': 6,
  '36': 6,
  '41': 13,
}

/** AIs we care about that are variable-length (max data length per GS1 spec). */
const VARIABLE_LENGTH_AI: Record<string, number> = {
  '10': 20, // Batch / lot
  '21': 20, // Serial number
  '22': 20,
  '240': 30,
  '241': 30,
  '242': 6,
  '30': 8,
  '37': 8,
  '90': 30,
  '91': 30,
  '92': 30,
  '93': 30,
  '99': 30,
}

/** Three-digit AI prefixes, checked before two-digit ones. */
const THREE_DIGIT_PREFIXES = ['240', '241', '242', '250', '251', '253', '254']

function isDigits(value: string): boolean {
  return value.length > 0 && /^[0-9]+$/.test(value)
}

/**
 * Find where a following AI sequence begins inside a variable-length field
 * that swallowed it because the symbol lost its FNC1 separator.
 *
 * This happens routinely in practice: Apple Vision's `payloadStringValue` and
 * several hardware scanners return GS1 data with the 0x1d bytes removed. The
 * lot or serial then absorbs the expiry, and the date is lost entirely.
 *
 * Returns the offset at which the real field ends, or null when no confident
 * split exists. The bar for "confident" is deliberately high — every
 * candidate AI must consume its full fixed length and, for dates, yield a real
 * calendar date — so that ordinary lot codes containing digits are left alone.
 * A wrong split is worse than no split, so ambiguity means null.
 */
function findEmbeddedAiBoundary(data: string): number | null {
  // Only fixed-length AIs can be recognised unambiguously mid-string; a
  // variable-length one has no length to check against. A following
  // variable-length AI is still accepted as corroboration once a fixed-length
  // one has anchored the split.
  const CANDIDATES = ['17', '15', '16', '11', '12', '13', '01']

  /** Does `rest` look like a legal continuation of the element string? */
  const isPlausibleTail = (rest: string): boolean => {
    if (rest.length === 0) return true

    const two = rest.slice(0, 2)
    const fixed = FIXED_LENGTH_AI[two]
    if (fixed !== undefined) {
      const value = rest.slice(2, 2 + fixed)
      if (value.length !== fixed || !isDigits(value)) return false
      // A date AI must still yield a real date.
      if (['17', '15', '16', '11', '12', '13'].includes(two) && !parseGs1Date(value)) return false
      return isPlausibleTail(rest.slice(2 + fixed))
    }

    if (VARIABLE_LENGTH_AI[two] !== undefined) {
      // Variable field runs to the end or to the next recognisable AI; either
      // way its presence corroborates the split.
      return rest.length > 2
    }

    return false
  }

  // A real lot is rarely empty, so start at 1 and take the earliest split
  // whose remainder parses cleanly all the way to the end.
  for (let at = 1; at < data.length - 2; at++) {
    for (const ai of CANDIDATES) {
      if (!data.startsWith(ai, at)) continue

      const dataLength = FIXED_LENGTH_AI[ai]
      const candidate = data.slice(at + ai.length, at + ai.length + dataLength)
      if (candidate.length !== dataLength || !isDigits(candidate)) continue

      // Dates must be real dates; GTINs must pass their check digit.
      if (ai !== '01' && !parseGs1Date(candidate)) continue
      if (ai === '01' && !isValidGtinCheckDigit(candidate)) continue

      if (isPlausibleTail(data.slice(at + ai.length + dataLength))) return at
    }

    // Also allow a variable-length AI to anchor the split, but only when a
    // valid fixed-length AI follows it — e.g. a serial that swallowed
    // "10LOT9" + "17271125". The trailing fixed field is what makes this
    // safe; a bare "10..." match would fire on ordinary lot codes.
    const two = data.slice(at, at + 2)
    if (VARIABLE_LENGTH_AI[two] === undefined) continue

    const after = data.slice(at + 2)
    for (let inner = 1; inner <= Math.min(after.length, VARIABLE_LENGTH_AI[two]); inner++) {
      const rest = after.slice(inner)
      if (rest.length === 0) continue
      const restAi = rest.slice(0, 2)
      const restLen = FIXED_LENGTH_AI[restAi]
      if (restLen === undefined) continue

      const restValue = rest.slice(2, 2 + restLen)
      if (restValue.length !== restLen || !isDigits(restValue)) continue
      if (['17', '15', '16', '11', '12', '13'].includes(restAi) && !parseGs1Date(restValue)) {
        continue
      }
      if (isPlausibleTail(rest.slice(2 + restLen))) return at
    }
  }
  return null
}

/**
 * Convert a GS1 `YYMMDD` date to ISO `YYYY-MM-DD`.
 *
 * Per the GS1 General Specifications, a day of `00` means "end of month".
 * The two-digit year uses a 50-year sliding window relative to the current
 * year, so `49` reads as 2049 while `85` reads as 1985.
 */
export function parseGs1Date(yymmdd: string, now: Date = new Date()): string {
  if (yymmdd.length !== 6 || !isDigits(yymmdd)) return ''

  const yy = parseInt(yymmdd.slice(0, 2), 10)
  const mm = parseInt(yymmdd.slice(2, 4), 10)
  let dd = parseInt(yymmdd.slice(4, 6), 10)

  if (mm < 1 || mm > 12) return ''

  const currentYear = now.getFullYear()
  const currentCentury = Math.floor(currentYear / 100) * 100
  let year = currentCentury + yy
  const diff = year - currentYear
  if (diff > 50) year -= 100
  else if (diff < -50) year += 100

  // Day 00 means the last day of that month.
  if (dd === 0) dd = new Date(Date.UTC(year, mm, 0)).getUTCDate()

  const daysInMonth = new Date(Date.UTC(year, mm, 0)).getUTCDate()
  if (dd < 1 || dd > daysInMonth) return ''

  const mmStr = String(mm).padStart(2, '0')
  const ddStr = String(dd).padStart(2, '0')
  return `${year}-${mmStr}-${ddStr}`
}

/** Validate a GTIN-8/12/13/14 mod-10 check digit. */
export function isValidGtinCheckDigit(gtin: string): boolean {
  if (!isDigits(gtin)) return false
  if (![8, 12, 13, 14].includes(gtin.length)) return false

  const digits = gtin.split('').map((d) => parseInt(d, 10))
  const check = digits.pop() as number

  // Weights alternate 3,1,3,1... reading right-to-left from the check digit.
  let sum = 0
  for (let i = digits.length - 1, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) {
    sum += digits[i] * weight
  }
  return (10 - (sum % 10)) % 10 === check
}

/**
 * Parse a GS1 element string into its Application Identifiers.
 *
 * Handles both the human-readable parenthesised form `(01)0123...` and the
 * raw scanner form using FNC1 separators.
 */
export function parseGS1(text: string, now: Date = new Date()): ParsedBarcode {
  const warnings: string[] = []
  const raw = text

  let work = text.trim()

  // Some scanners emit a leading "]d2"/"]C1" symbology identifier.
  work = work.replace(/^\][A-Za-z][0-9]/, '')

  // The parenthesised form is unambiguous: convert "(01)" markers into FNC1
  // delimited fields rather than blindly deleting the parentheses.
  const hasParens = /\(\d{2,4}\)/.test(work)
  if (hasParens) {
    work = work.replace(/\((\d{2,4})\)/g, (_m, ai) => `${GS}${ai}`)
    if (work.startsWith(GS)) work = work.slice(1)
  }

  // Normalise alternative separator encodings to a real FNC1, but preserve
  // the separator itself — it is the only reliable field terminator.
  work = work.replace(/<GS>/g, GS).replace(/\{FNC1\}/gi, GS).replace(/\x1e/g, GS)

  // Strip control characters EXCEPT the group separator.
  work = work
    .split('')
    .filter((ch) => ch === GS || ch.charCodeAt(0) >= 0x20)
    .join('')

  let gtin = ''
  let batch = ''
  let expirationDate = ''
  let serial = ''

  let i = 0
  let sawAnyAi = false

  while (i < work.length) {
    if (work[i] === GS) {
      i++
      continue
    }

    const remaining = work.slice(i)

    // Resolve the AI, preferring the longer three-digit form.
    let ai = ''
    const three = remaining.slice(0, 3)
    if (THREE_DIGIT_PREFIXES.includes(three)) {
      ai = three
    } else {
      const two = remaining.slice(0, 2)
      if (FIXED_LENGTH_AI[two] !== undefined || VARIABLE_LENGTH_AI[two] !== undefined) {
        ai = two
      }
    }

    if (!ai) {
      // Not a recognised AI. Skip to the next separator rather than
      // advancing one character at a time and mis-locking onto digits
      // inside a data field.
      const nextSep = remaining.indexOf(GS)
      if (nextSep === -1) break
      i += nextSep + 1
      continue
    }

    sawAnyAi = true
    const dataLength = FIXED_LENGTH_AI[ai]

    if (dataLength !== undefined) {
      const data = remaining.slice(ai.length, ai.length + dataLength)

      if (data.length < dataLength) {
        warnings.push(`AI ${ai} is truncated`)
        break
      }

      switch (ai) {
        case '01':
        case '02': {
          if (isDigits(data)) {
            if (ai === '01') gtin = data
          } else {
            warnings.push(`AI ${ai} contains non-numeric data`)
          }
          break
        }
        case '17': {
          const iso = parseGs1Date(data, now)
          if (iso) expirationDate = iso
          else warnings.push(`Expiry date "${data}" is not a valid YYMMDD value`)
          break
        }
        case '15':
        case '16': {
          // Best-before / sell-by act as an expiry when 17 is absent.
          if (!expirationDate) {
            const iso = parseGs1Date(data, now)
            if (iso) expirationDate = iso
          }
          break
        }
      }

      i += ai.length + dataLength
      continue
    }

    // Variable length: runs to the next FNC1 or the end of the string.
    const afterAi = remaining.slice(ai.length)
    const sepIdx = afterAi.indexOf(GS)
    const maxLen = VARIABLE_LENGTH_AI[ai] ?? 30
    let data = sepIdx === -1 ? afterAi : afterAi.slice(0, sepIdx)

    if (sepIdx === -1) {
      // Some scanners and OS decoders (notably Apple Vision's string payload)
      // drop FNC1 entirely. The variable-length field then swallows everything
      // after it, so the lot absorbs the expiry and both come back wrong.
      // Recover the split when the tail parses cleanly as real AIs, and always
      // warn — the boundary is inferred, so a human must confirm it.
      //
      // This must run before the max-length check below: truncating first
      // would discard the very bytes the boundary search needs.
      const split = findEmbeddedAiBoundary(data)
      if (split) {
        warnings.push(
          `This barcode is missing its field separator. The ${
            ai === '10' ? 'lot' : ai === '21' ? 'serial' : 'field'
          } was read as "${data.slice(0, split)}" — please confirm it and the values below.`
        )
        // Re-parse the tail as if the separator had been present.
        const tail = remaining.slice(ai.length + split)
        work = work.slice(0, i + ai.length + split) + GS + tail
        data = data.slice(0, split)
      } else if (data.length > maxLen) {
        // No terminator, no recoverable boundary, and the field overruns its
        // legal maximum. Truncating would invent data, so keep the value but
        // flag it for human confirmation.
        warnings.push(
          `Field ${ai} has no separator and exceeds its maximum length; verify the value`
        )
        data = data.slice(0, maxLen)
      }
    }

    if (ai === '10') batch = data
    else if (ai === '21') serial = data

    i += ai.length + data.length + (sepIdx === -1 ? 0 : 1)
  }

  // A bare numeric payload from a linear symbol is a plain GTIN/EAN.
  if (!sawAnyAi && isDigits(work)) {
    if ([8, 12, 13, 14].includes(work.length)) {
      return {
        gtin: work,
        batch: '',
        expirationDate: '',
        serial: '',
        raw,
        format: 'RAW',
        warnings: isValidGtinCheckDigit(work) ? [] : ['GTIN check digit does not validate'],
      }
    }
  }

  if (gtin && !isValidGtinCheckDigit(gtin)) {
    warnings.push('GTIN check digit does not validate')
  }
  if (!gtin) warnings.push('No GTIN found in barcode')

  return {
    gtin,
    batch,
    expirationDate,
    serial,
    raw,
    format: sawAnyAi ? 'GS1' : 'RAW',
    warnings,
  }
}

/**
 * Parse an HIBC (Health Industry Bar Code) string, used widely for EU IVDR
 * and UDI labelling. Format: `+<LIC><PRODUCT><UOM>/<secondary><check>`.
 */
export function parseHIBC(text: string): ParsedBarcode {
  const warnings: string[] = []
  const raw = text

  const work = text.trim().replace(/^\][A-Za-z][0-9]/, '')
  if (!work.startsWith('+')) {
    warnings.push('Not a valid HIBC string')
    return { gtin: '', batch: '', expirationDate: '', serial: '', raw, format: 'HIBC', warnings }
  }

  // Drop the leading '+'. The trailing character is a Mod-43 check character;
  // it is only stripped where a secondary segment defines the boundary.
  // HIBC dates carry an explicit year, so no reference date is needed here.
  const body = work.slice(1)

  let gtin = ''
  let batch = ''
  let expirationDate = ''
  let serial = ''

  const slashIdx = body.indexOf('/')

  if (slashIdx === -1) {
    // Primary segment only; last character is the check character.
    gtin = body.length > 1 ? body.slice(0, -1) : body
    return { gtin, batch, expirationDate, serial, raw, format: 'HIBC', warnings }
  }

  gtin = body.slice(0, slashIdx)
  let secondary = body.slice(slashIdx + 1)

  // Trim the trailing Mod-43 check character.
  if (secondary.length > 0) secondary = secondary.slice(0, -1)

  const readDate = (value: string, order: 'MMDDYY' | 'YYMMDD' | 'YYYYMMDD'): string => {
    let y: number, m: number, d: number
    if (order === 'MMDDYY') {
      m = parseInt(value.slice(0, 2), 10)
      d = parseInt(value.slice(2, 4), 10)
      y = 2000 + parseInt(value.slice(4, 6), 10)
    } else if (order === 'YYMMDD') {
      y = 2000 + parseInt(value.slice(0, 2), 10)
      m = parseInt(value.slice(2, 4), 10)
      d = parseInt(value.slice(4, 6), 10)
    } else {
      y = parseInt(value.slice(0, 4), 10)
      m = parseInt(value.slice(4, 6), 10)
      d = parseInt(value.slice(6, 8), 10)
    }
    if (!Number.isFinite(y) || m < 1 || m > 12 || d < 1) return ''
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
    if (d > daysInMonth) return ''
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  if (secondary.startsWith('$$')) {
    let rest = secondary.slice(2)

    // '$$+' marks a serial number rather than a lot.
    let isSerial = false
    if (rest.startsWith('+')) {
      isSerial = true
      rest = rest.slice(1)
    }

    const flag = rest.charAt(0)
    const afterFlag = rest.slice(1)

    let value = ''
    switch (flag) {
      case '2':
        expirationDate = readDate(afterFlag.slice(0, 6), 'MMDDYY')
        value = afterFlag.slice(6)
        break
      case '3':
        expirationDate = readDate(afterFlag.slice(0, 6), 'YYMMDD')
        value = afterFlag.slice(6)
        break
      case '4': {
        // YYMMDDHH — the hour is present but not tracked.
        expirationDate = readDate(afterFlag.slice(0, 6), 'YYMMDD')
        value = afterFlag.slice(8)
        break
      }
      case '5': {
        // Julian date YYJJJ.
        const yy = parseInt(afterFlag.slice(0, 2), 10)
        const jjj = parseInt(afterFlag.slice(2, 5), 10)
        if (Number.isFinite(yy) && Number.isFinite(jjj) && jjj >= 1 && jjj <= 366) {
          const dt = new Date(Date.UTC(2000 + yy, 0, jjj))
          expirationDate = dt.toISOString().slice(0, 10)
        }
        value = afterFlag.slice(5)
        break
      }
      case '6':
        expirationDate = readDate(afterFlag.slice(0, 8), 'YYYYMMDD')
        value = afterFlag.slice(8)
        break
      case '7':
        // Quantity + no date.
        value = afterFlag.slice(2)
        break
      default:
        // No date qualifier; the whole remainder is the lot or serial.
        value = rest
        break
    }

    if (isSerial) serial = value.trim()
    else batch = value.trim()
  } else if (secondary.startsWith('$+')) {
    serial = secondary.slice(2).trim()
  } else if (secondary.startsWith('$')) {
    batch = secondary.slice(1).trim()
  } else {
    batch = secondary.trim()
  }

  if (!gtin) warnings.push('No product identifier found in HIBC string')

  return { gtin, batch, expirationDate, serial, raw, format: 'HIBC', warnings }
}

/** Route a decoded symbol to the correct parser. */
export function parseBarcode(text: string, now: Date = new Date()): ParsedBarcode {
  const trimmed = text.trim().replace(/^\][A-Za-z][0-9]/, '')
  if (trimmed.startsWith('+')) return parseHIBC(text)
  return parseGS1(text, now)
}
