/**
 * Parser test suite. Runs on the Node test runner:
 *
 *   npm test
 *
 * Cases marked REGRESSION are strings that the pre-rewrite parser decoded
 * incorrectly, usually by inventing a wrong expiry date.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseBarcode, parseGS1, parseHIBC, parseGs1Date, isValidGtinCheckDigit } from './barcode.ts'

const GS = '\x1d'
// Fixed reference date so the sliding-window year logic is deterministic.
const NOW = new Date('2026-08-06T00:00:00Z')

test('GTIN check digit validation', () => {
  assert.equal(isValidGtinCheckDigit('03453120000011'), true)
  assert.equal(isValidGtinCheckDigit('05012345678900'), true)
  assert.equal(isValidGtinCheckDigit('03453120000012'), false)
  assert.equal(isValidGtinCheckDigit('123'), false)
  assert.equal(isValidGtinCheckDigit('abcdefghijklmn'), false)
})

test('GS1 date: plain YYMMDD', () => {
  assert.equal(parseGs1Date('271125', NOW), '2027-11-25')
})

test('GS1 date: day 00 means end of month', () => {
  assert.equal(parseGs1Date('270200', NOW), '2027-02-28')
  assert.equal(parseGs1Date('280200', NOW), '2028-02-29') // leap year
  assert.equal(parseGs1Date('271200', NOW), '2027-12-31')
})

test('GS1 date: rejects invalid months and days', () => {
  assert.equal(parseGs1Date('271325', NOW), '')
  assert.equal(parseGs1Date('270230', NOW), '')
  assert.equal(parseGs1Date('27AB25', NOW), '')
})

test('GS1 date: 50-year sliding window', () => {
  assert.equal(parseGs1Date('491125', NOW), '2049-11-25')
  assert.equal(parseGs1Date('851125', NOW), '1985-11-25')
})

test('GS1: standard GTIN + expiry + lot', () => {
  const r = parseGS1('010345312000001117271125' + '10ABCD1234', NOW)
  assert.equal(r.gtin, '03453120000011')
  assert.equal(r.expirationDate, '2027-11-25')
  assert.equal(r.batch, 'ABCD1234')
  assert.equal(r.format, 'GS1')
})

test('GS1: parenthesised human-readable form', () => {
  const r = parseGS1('(01)03453120000011(17)271125(10)ABCD1234', NOW)
  assert.equal(r.gtin, '03453120000011')
  assert.equal(r.expirationDate, '2027-11-25')
  assert.equal(r.batch, 'ABCD1234')
})

test('REGRESSION: lot code containing "17" no longer corrupts the expiry', () => {
  // Old parser produced expirationDate "20CD-17-19" and an empty batch.
  const r = parseGS1(`010345312000001110AB17CD${GS}17271125`, NOW)
  assert.equal(r.gtin, '03453120000011')
  assert.equal(r.batch, 'AB17CD')
  assert.equal(r.expirationDate, '2027-11-25')
})

test('REGRESSION: numeric lot code no longer swallows the GTIN', () => {
  // Old parser produced gtin "14" from the trailing lot digits.
  const r = parseGS1(`01034531200000111727112510${GS}`.replace(`10${GS}`, '') + `${GS}100114`, NOW)
  assert.equal(r.gtin, '03453120000011')
  assert.equal(r.expirationDate, '2027-11-25')
  assert.equal(r.batch, '0114')
})

test('REGRESSION: lot preceding expiry parses both fields', () => {
  // Old parser produced "2019-11- 2" style garbage on this ordering.
  const r = parseGS1(`010345312000001110LOT123${GS}17271125`, NOW)
  assert.equal(r.gtin, '03453120000011')
  assert.equal(r.batch, 'LOT123')
  assert.equal(r.expirationDate, '2027-11-25')
})

test('REGRESSION: lot beginning with "21" is not read as a serial', () => {
  const r = parseGS1(`010345312000001110219900${GS}17271125`, NOW)
  assert.equal(r.batch, '219900')
  assert.equal(r.expirationDate, '2027-11-25')
})

test('GS1: serial number is captured separately from lot', () => {
  const r = parseGS1(`01034531200000112112345678${GS}10LOT9${GS}17271125`, NOW)
  assert.equal(r.serial, '12345678')
  assert.equal(r.batch, 'LOT9')
  assert.equal(r.expirationDate, '2027-11-25')
})

test('GS1: trailing variable field without separator', () => {
  const r = parseGS1('01034531200000111727112510FINALLOT', NOW)
  assert.equal(r.batch, 'FINALLOT')
  assert.equal(r.expirationDate, '2027-11-25')
})

test('GS1: symbology identifier prefix is stripped', () => {
  const r = parseGS1(']d201034531200000111727112510AB12', NOW)
  assert.equal(r.gtin, '03453120000011')
  assert.equal(r.batch, 'AB12')
})

test('GS1: best-before (15) substitutes for a missing expiry (17)', () => {
  const r = parseGS1('010345312000001115271125' + '10AB', NOW)
  assert.equal(r.expirationDate, '2027-11-25')
})

test('GS1: bare EAN-13 payload', () => {
  const r = parseGS1('5012345678900', NOW)
  assert.equal(r.gtin, '5012345678900')
  assert.equal(r.format, 'RAW')
  assert.deepEqual(r.warnings, [])
})

test('GS1: bad check digit is flagged but still returned', () => {
  const r = parseGS1('010345312000001217271125', NOW)
  assert.equal(r.gtin, '03453120000012')
  assert.ok(r.warnings.some((w) => w.includes('check digit')))
})

test('GS1: production date (11) does not overwrite the expiry', () => {
  const r = parseGS1('0103453120000011' + '11250101' + '17271125', NOW)
  assert.equal(r.expirationDate, '2027-11-25')
})

test('HIBC: primary segment only', () => {
  const r = parseHIBC('+A123BJC5D6E71')
  assert.equal(r.format, 'HIBC')
  assert.equal(r.gtin, 'A123BJC5D6E7')
})

test('HIBC: $$3 YYMMDD date with lot', () => {
  const r = parseHIBC('+A99912345/$$3271125LOT42A')
  assert.equal(r.expirationDate, '2027-11-25')
  assert.equal(r.batch, 'LOT42')
})

test('HIBC: $$2 MMDDYY date with lot', () => {
  const r = parseHIBC('+A99912345/$$2112527LOT42A')
  assert.equal(r.expirationDate, '2027-11-25')
  assert.equal(r.batch, 'LOT42')
})

test('HIBC: $$6 YYYYMMDD date', () => {
  const r = parseHIBC('+A99912345/$$620271125LOT7A')
  assert.equal(r.expirationDate, '2027-11-25')
  assert.equal(r.batch, 'LOT7')
})

test('HIBC: $$5 Julian date', () => {
  const r = parseHIBC('+A99912345/$$527001LOT1A')
  assert.equal(r.expirationDate, '2027-01-01')
  assert.equal(r.batch, 'LOT1')
})

test('HIBC: plain $ lot segment', () => {
  const r = parseHIBC('+A99912345/$LOT99A')
  assert.equal(r.batch, 'LOT99')
  assert.equal(r.expirationDate, '')
})

test('HIBC: $$+ marks a serial rather than a lot', () => {
  const r = parseHIBC('+A99912345/$$+3271125SER1A')
  assert.equal(r.serial, 'SER1')
  assert.equal(r.batch, '')
  assert.equal(r.expirationDate, '2027-11-25')
})

// ── Missing FNC1 ────────────────────────────────────────────────────────
// Apple Vision's `payloadStringValue` and several hardware scanners return
// GS1 data with the 0x1d separators removed. Without recovery the lot
// swallows the expiry and the date is lost silently — the worst failure mode
// for a medical inventory. These payloads were captured from real decodes.

test('FNC1 stripped: lot + expiry are recovered and flagged', () => {
  const r = parseGS1('010345312000001110AB17CD17271125', NOW)
  assert.equal(r.gtin, '03453120000011')
  assert.equal(r.batch, 'AB17CD')
  assert.equal(r.expirationDate, '2027-11-25')
  assert.ok(r.warnings.some((w) => w.includes('missing its field separator')))
})

test('FNC1 stripped: serial + lot + expiry are recovered', () => {
  // Exactly what Apple Vision returned for test-fixtures/gs1-qr-serial.png.
  const r = parseGS1('0103453120000011211234567810LOT917271125', NOW)
  assert.equal(r.gtin, '03453120000011')
  assert.equal(r.serial, '12345678')
  assert.equal(r.batch, 'LOT9')
  assert.equal(r.expirationDate, '2027-11-25')
  assert.ok(r.warnings.some((w) => w.includes('missing its field separator')))
})

test('FNC1 present: no split is inferred and no warning is raised', () => {
  const r = parseGS1(`0103453120000011${GS}2112345678${GS}10LOT9${GS}17271125`, NOW)
  assert.equal(r.serial, '12345678')
  assert.equal(r.batch, 'LOT9')
  assert.equal(r.expirationDate, '2027-11-25')
  assert.deepEqual(r.warnings, [])
})

test('no false splits on ordinary lot codes', () => {
  // Each of these is a legitimate trailing lot that must be left intact.
  for (const [payload, expected] of [
    ['01034531200000111727112510ABCD1234', 'ABCD1234'],
    ['01034531200000111727112510LOT99', 'LOT99'],
    ['010345312000001117271125100114', '0114'],
    // "17" followed by digits that are NOT a valid date must not split.
    ['01034531200000111727112510AB179999', 'AB179999'],
  ] as const) {
    const r = parseGS1(payload, NOW)
    assert.equal(r.batch, expected, `lot changed for ${payload}`)
    assert.equal(r.expirationDate, '2027-11-25')
    assert.ok(
      !r.warnings.some((w) => w.includes('missing its field separator')),
      `false split warning for ${payload}`
    )
  }
})

test('router: dispatches HIBC vs GS1 correctly', () => {
  assert.equal(parseBarcode('+A99912345/$LOT99A', NOW).format, 'HIBC')
  assert.equal(parseBarcode('010345312000001117271125', NOW).format, 'GS1')
})

test('parser never throws on malformed input', () => {
  const inputs = ['', '   ', '01', '17', '(((())))', '\x1d\x1d\x1d', '+', '+/', 'not a barcode at all', '0'.repeat(500)]
  for (const input of inputs) {
    assert.doesNotThrow(() => parseBarcode(input, NOW), `threw on ${JSON.stringify(input)}`)
  }
})
