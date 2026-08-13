/**
 * Key/value storage that cannot hang.
 *
 * Capacitor Preferences is the right store on a device, but in a plain
 * browser its web shim can leave the promise pending forever rather than
 * rejecting. `await`ing it during startup then hangs the whole app on the
 * loading screen with no error — so every call races a timeout and falls back
 * to localStorage.
 */

import { Preferences } from '@capacitor/preferences'

const TIMEOUT_MS = 1500

/** The Preferences web shim namespaces its localStorage keys with this. */
const WEB_PREFIX = 'CapacitorStorage.'

/** Resolve to `fallback` if `promise` has not settled in time. */
function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), TIMEOUT_MS)),
  ])
}

function localGet(key: string): string | null {
  try {
    // Check the prefixed key first so values written by Preferences on the web
    // are still found when we fall back.
    return localStorage.getItem(WEB_PREFIX + key) ?? localStorage.getItem(key)
  } catch {
    return null
  }
}

export async function storageGet(key: string): Promise<string | null> {
  const viaPreferences = await withTimeout(
    Preferences.get({ key }).then((r) => r.value ?? null),
    null
  )
  return viaPreferences ?? localGet(key)
}

export async function storageSet(key: string, value: string): Promise<void> {
  await withTimeout(Preferences.set({ key, value }), undefined)
  // Mirror to localStorage so a browser session keeps working even when the
  // Preferences shim is unavailable.
  try {
    localStorage.setItem(WEB_PREFIX + key, value)
    localStorage.setItem(key, value)
  } catch {
    /* quota or private mode — not fatal */
  }
}

export async function storageRemove(key: string): Promise<void> {
  await withTimeout(Preferences.remove({ key }), undefined)
  try {
    localStorage.removeItem(WEB_PREFIX + key)
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}
