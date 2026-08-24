'use client'

/**
 * Deliver a generated file to the user.
 *
 * Native: write to the app's cache directory, then hand the URI to the OS
 * share sheet (Files, Mail, AirDrop…). Web: a normal blob download.
 */

import { toCsv, toPdf, type ExportOptions } from '@/core/export'
import type { ProductWithBatches } from '@/core/types'

export type ExportFormat = 'csv' | 'pdf'

function timestampedName(format: ExportFormat, at: Date): string {
  // Colons are illegal in filenames on some targets, so use a flat stamp.
  const stamp = at.toISOString().slice(0, 16).replace(/[:T]/g, '-')
  return `labstock-${stamp}.${format}`
}

/** Base64 without the data: prefix, which is what Filesystem.writeFile wants. */
function toBase64(bytes: Uint8Array): string {
  let binary = ''
  // Chunked: a single spread of a large array overflows the call stack.
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

async function downloadInBrowser(bytes: Uint8Array, filename: string, mime: string) {
  // Copy into a fresh buffer: the view may be a slice of a larger allocation.
  const blob = new Blob([bytes.slice()], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoke on the next tick so the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function exportInventory(
  products: ProductWithBatches[],
  format: ExportFormat,
  options: ExportOptions
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const filename = timestampedName(format, options.generatedAt)
    const mime = format === 'csv' ? 'text/csv' : 'application/pdf'
    const bytes =
      format === 'csv'
        ? new TextEncoder().encode(toCsv(products, options))
        : toPdf(products, options)

    const { Capacitor } = await import('@capacitor/core')

    if (!Capacitor.isNativePlatform()) {
      await downloadInBrowser(bytes, filename, mime)
      return { ok: true }
    }

    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const { Share } = await import('@capacitor/share')

    // Cache, not Documents: this is a transient artefact the user is about to
    // send somewhere, and the OS can reclaim it afterwards.
    const written = await Filesystem.writeFile({
      path: filename,
      data: toBase64(bytes),
      directory: Directory.Cache,
    })

    await Share.share({ title: filename, url: written.uri, dialogTitle: filename })
    return { ok: true }
  } catch (e) {
    // A cancelled share sheet rejects; that is a normal user action, not an
    // error worth showing.
    const message = e instanceof Error ? e.message : String(e)
    if (/cancel/i.test(message)) return { ok: true }
    return { ok: false, error: message }
  }
}
